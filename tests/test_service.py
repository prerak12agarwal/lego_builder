import hashlib
import http.client
import json
import subprocess
import threading
import pytest
import trimesh
from lego_builder.service import (ConverterServer,RequestError,canonical_settings_hash,
                                  validate_request,convert_payload,MAX_REQUEST_BYTES)


def request_payload(obj='v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n',target=2000):
    settings={'targetParts':target,'inputUpAxis':'z'}
    return {'schemaVersion':1,'obj':obj,'sourceObjSha256':hashlib.sha256(obj.encode()).hexdigest(),
            'settingsSha256':canonical_settings_hash(settings),'settings':settings}


def test_hash_contract_uses_sorted_compact_keys_and_raw_obj():
    payload=request_payload()
    expected=hashlib.sha256(b'{"inputUpAxis":"z","targetParts":2000}').hexdigest()
    assert payload['settingsSha256']==expected
    checked,obj=validate_request(json.dumps(payload).encode())
    assert obj==payload['obj'].encode() and checked==payload
    payload['obj']+='\n'
    with pytest.raises(RequestError,match='source_hash_mismatch'):validate_request(json.dumps(payload).encode())


@pytest.mark.parametrize('field,value', [('targetParts',True),('targetParts',2201),('inputUpAxis','auto')])
def test_invalid_settings_rejected(field,value):
    payload=request_payload();payload['settings'][field]=value
    with pytest.raises(RequestError,match='invalid_settings'):validate_request(json.dumps(payload).encode())


def test_hash_mismatch_and_duplicate_json_keys_rejected():
    payload=request_payload();payload['settingsSha256']='0'*64
    with pytest.raises(RequestError,match='settings_hash_mismatch'):validate_request(json.dumps(payload).encode())
    with pytest.raises(RequestError,match='invalid_json'):validate_request(b'{"obj":"a","obj":"b"}')


@pytest.fixture
def running_server():
    server=ConverterServer(('127.0.0.1',0),'test-token',conversion=lambda p,b:{'accepted':True})
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    yield server
    server.shutdown();server.server_close();thread.join(timeout=2)


def call(server,method,path,body=None,headers=None):
    connection=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=3)
    connection.request(method,path,body,headers or {})
    response=connection.getresponse();status=response.status;data=json.loads(response.read());connection.close()
    return status,data


def test_health_auth_and_valid_http_request(running_server):
    assert call(running_server,'GET','/health')[0]==200
    raw=json.dumps(request_payload()).encode()
    assert call(running_server,'POST','/convert',raw,{'Content-Type':'application/json'})==(401,{'error':'unauthorized'})
    assert call(running_server,'POST','/convert',raw,{'Authorization':'Bearer test-token','Content-Type':'application/json'})==(200,{'accepted':True})


def test_busy_and_oversized_requests_do_not_start_conversion(running_server):
    headers={'Authorization':'Bearer test-token','Content-Type':'application/json'}
    running_server.conversion_slot.acquire()
    try:assert call(running_server,'POST','/convert',b'{}',headers)[0]==429
    finally:running_server.conversion_slot.release()
    assert call(running_server,'POST','/convert',b'',{**headers,'Content-Length':str(MAX_REQUEST_BYTES+1)})==(413,{'error':'request_size_limit'})
    # The HTTP response is written before the handler's finally clause releases
    # the slot; wait for that completion rather than racing the server thread.
    assert running_server.conversion_slot.acquire(timeout=1)
    running_server.conversion_slot.release()


def test_missing_token_fails_closed():
    with pytest.raises(ValueError,match='CONVERTER_TOKEN'):ConverterServer(('127.0.0.1',0),'')


def test_worker_timeout_is_reported_and_does_not_leak_credentials(monkeypatch):
    import lego_builder.service as service
    monkeypatch.setenv('CONVERTER_TOKEN','must-not-leak')
    def timeout(command,**kwargs):
        assert 'CONVERTER_TOKEN' not in kwargs['env']
        raise subprocess.TimeoutExpired(command,1)
    monkeypatch.setattr(service.subprocess,'run',timeout)
    payload=request_payload()
    with pytest.raises(RequestError,match='conversion_timeout'):convert_payload(payload,payload['obj'].encode(),timeout=1)


def test_real_worker_returns_actual_bounded_ldr():
    obj=trimesh.exchange.obj.export_obj(trimesh.creation.icosphere(subdivisions=1),include_normals=False)
    payload=request_payload(obj,target=100)
    result=convert_payload(payload,obj.encode(),timeout=30)
    assert result['sourceObjSha256']==payload['sourceObjSha256']
    assert result['settingsSha256']==payload['settingsSha256']
    assert result['producer']['name']=='lego-builder'
    placements=[line for line in result['ldr'].splitlines() if line.startswith('1 ')]
    assert 1<=len(placements)<=2500
    assert all(line.endswith('.dat') for line in placements)
    assert len(result['ldr'].encode())<=5*1024*1024


def test_real_http_obj_to_ldr_end_to_end(running_server):
    running_server.conversion=convert_payload
    obj=trimesh.exchange.obj.export_obj(trimesh.creation.box(),include_normals=False)
    payload=request_payload(obj,target=100)
    status,result=call(running_server,'POST','/convert',json.dumps(payload).encode(),
                       {'Authorization':'Bearer test-token','Content-Type':'application/json'})
    assert status==200
    assert result['sourceObjSha256']==payload['sourceObjSha256']
    assert result['settingsSha256']==payload['settingsSha256']
    assert result['schemaVersion']==1
    assert sum(line.startswith('1 ') for line in result['ldr'].splitlines())>0
    assert '!LEGO_BUILDER_REVISION ' in result['ldr']
