import hashlib
import numpy as np
import pytest
from lego_builder.exterior import read_exterior, inside_polygon


def test_intake_preserves_source_and_excludes_interior(tmp_path):
    source = tmp_path/'source.obj'
    raw = ('mtllib ../../private.mtl\no Body_Shell_Cube.001\nv -1 0 -3\nv 1 0 -3\nv 1 1 3\nv -1 1 3\nf 1 2 3 4\n'
           'o Seat_Cube.030\nv 0 999 0\nf 1 2 5\n').encode()
    source.write_bytes(raw)
    groups, provenance = read_exterior(source,60)
    assert source.read_bytes() == raw
    assert set(groups) == {'Body_Shell_Cube.001'}
    assert provenance['discarded_groups'][0]['name'] == 'Seat_Cube.030'
    assert provenance['source']['sha256'] == hashlib.sha256(raw).hexdigest()
    assert np.ptp(groups['Body_Shell_Cube.001'][:,2]) == 1200
    matrix = np.array(provenance['source_to_ldraw_matrix'])
    assert np.linalg.det(matrix[:3,:3]) > 0
    # Source +Y remains upward in native -Y-up LDraw.
    assert matrix[1,1] < 0 and matrix[2,2] < 0


@pytest.mark.parametrize('line',['v nan 1 2','v inf 1 2','v 1 2'])
def test_nonfinite_or_short_vertex_rejected(tmp_path,line):
    path=tmp_path/'bad.obj';path.write_text('o Body_Shell_Cube.001\n'+line+'\n')
    with pytest.raises(ValueError):read_exterior(path)


def test_source_with_missing_semantics_not_replaced_by_demo(tmp_path):
    path=tmp_path/'cube.obj';path.write_text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
    with pytest.raises(ValueError,match='requires the named'):read_exterior(path)


def test_convex_membership_winding_independent():
    polygon=np.array([[0,0],[2,0],[0,2]])
    points=np.array([[.25,.25],[2,2],[1,0]])
    assert inside_polygon(points,polygon).tolist() == [True,False,True]
    assert inside_polygon(points,polygon[::-1]).tolist() == [True,False,True]
