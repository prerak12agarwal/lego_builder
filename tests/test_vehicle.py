from copy import deepcopy
import numpy as np
import pytest
from lego_builder.vehicle import Builder
from lego_builder.assembly import SCHEMA, revision, inventory, ldraw_text, validate_candidate, validate_roundtrip, publish_candidate


def candidate():
    b=Builder(); b.add('3001',71,[12,-24,40],[[0,0,1],[0,1,0],[-1,0,0]],'test')
    m={'schema_version':SCHEMA,'placements':b.placements,'provenance':{'source':{'sha256':'source'}},
       'constraints':{'target_parts':2000,'target_band':[1800,2200],'target_tolerance':.1,
                      'max_output_parts':10000}}
    m['revision_id']=revision(m)
    return m


def test_rectangular_part_orientation_matches_real_ldraw_long_x_axis():
    b=Builder()
    b.panel('surface',[0,0,0],[1,0,0],[0,0,1],[[0,0],[40,0],[40,80],[0,80]],backing=True)
    assert len(b.placements)==2
    # Real 87079 2x4 tile's X extent is80 andZ40 (not the reverse).
    bounds=np.array([[-40,0,-20],[40,8,20]])
    for p in b.placements:
        r=np.array(p['rotation']).reshape(3,3)
        footprint=np.array([[x,0,z] for x in (-40,40) for z in (-20,20)])@r.T+np.array(p['position_ldu'])
        assert np.allclose(footprint.min(0)[[0,2]],[0,0])
        assert np.allclose(footprint.max(0)[[0,2]],[40,80])
        assert np.linalg.det(r)==pytest.approx(1)


def test_one_stud_trim_is_one_stud_not_two():
    b=Builder();b.strip('trim',[0,0,0],[0,0,80],[0,-1,0],71,1)
    assert sum(x['part_id']=='2431' for x in b.placements)==1
    assert len(b.placements)==2


def test_export_roundtrip_full_transform_and_inventory():
    m=candidate(); report=validate_candidate(m,ldraw_text(m),inventory(m))
    assert report['artifact_checks_passed']
    assert set(report['mechanical_checks'].values())=={'not_evaluated'}
    assert 'passed' not in report
    modified=ldraw_text(m).replace('3001.dat','3004.dat')
    with pytest.raises(ValueError,match='differs'):validate_roundtrip(modified,m)


@pytest.mark.parametrize('rotation',[[2,0,0,0,1,0,0,0,1],[-1,0,0,0,1,0,0,0,1]])
def test_scaling_and_reflections_rejected(rotation):
    m=candidate();m['placements'][0]['rotation']=rotation;m['revision_id']=revision(m)
    assert 'nonrigid_or_reflected_transform' in validate_candidate(m)['errors']


def test_metadata_and_colors_are_revision_bound():
    m=candidate();m['provenance']['source']['sha256']='changed'
    assert 'revision_hash_mismatch' in validate_candidate(m)['errors']
    m=candidate();m['placements'][0]['color']=0
    assert 'revision_hash_mismatch' in validate_candidate(m)['errors']


def test_duplicate_placements_and_bom_mismatch_rejected():
    m=candidate();m['placements'].append(deepcopy(m['placements'][0]));m['placements'][1]['id']='other';m['revision_id']=revision(m)
    assert 'duplicate_identical_placement' in validate_candidate(m)['errors']
    assert 'inventory_mismatch' in validate_candidate(m,bom={})['errors']


def test_publication_requires_resolved_catalog(tmp_path):
    with pytest.raises(ValueError,match='official LDraw library'):publish_candidate(tmp_path/'result',candidate())
    assert not (tmp_path/'result').exists()
