"""Geometry contract tests do not require a downloaded external library."""
import base64
import hashlib
import json
from pathlib import Path
import zlib

import numpy as np
import pytest

from lego_builder.ldraw_library import LDrawError, LDrawLibrary
from lego_builder.render import preview_data, write_preview


@pytest.fixture
def root(tmp_path):
    (tmp_path / "parts" / "s").mkdir(parents=True)
    (tmp_path / "p" / "48").mkdir(parents=True)
    (tmp_path / "LDConfig.ldr").write_text("0 Color definitions\n0 !COLOUR Red CODE 4 VALUE #B40000 EDGE #112233\n0 !COLOUR Light_Bluish_Gray CODE 71 VALUE #A0A5A9 EDGE #333333\n0 !COLOUR Black CODE 0 VALUE #05131D EDGE #595959\n")
    (tmp_path / "CAreadme.txt").write_text("LDraw contributor attribution fixture\n")
    return tmp_path


def dat(root, name, commands):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("0 " + path.stem + " fixture\n0 Author: Test Author\n0 !LICENSE Redistributable under CC BY 4.0\n" + commands + "\n")
    return path


def model(part="test", color=71, count=1):
    return {"schema_version": "lego-builder-ldraw-model-v1", "revision_id": "example-revision",
            "placements": [{"id": f"p{i}", "part_id": part, "color": color,
                            "position_ldu": [i*20, 0, 0], "rotation": [1,0,0,0,1,0,0,0,1]} for i in range(count)]}


def test_nested_row_major_transform_alias_and_color_inheritance(root):
    dat(root, "p/48/triangle.dat", "3 16 0 0 0 1 0 0 0 1 0\n3 4 0 0 1 1 0 1 0 1 1\n2 24 0 0 0 1 0 0")
    dat(root, "parts/s/panel.dat", "1 16 10 20 30 0 -1 0 1 0 0 0 0 1 48\\triangle.dat")
    dat(root, "parts/alias.dat", "1 71 1 2 3 2 0 0 0 3 0 0 0 4 s\\panel.dat")
    library = LDrawLibrary(root)
    geometry = library.geometry("ALIAS")
    expected = np.array([[21,62,123],[21,65,123],[19,62,123]])
    np.testing.assert_allclose(geometry.vertices[0], expected)
    assert geometry.colors.tolist() == [71,4]
    assert geometry.line_colors.tolist() == [-72]
    assert library.color(-72)["rgb"] == pytest.approx([.2,.2,.2])
    assert set(geometry.sources) == {"p/48/triangle.dat", "parts/s/panel.dat", "parts/alias.dat"}
    assert geometry.sources["parts/alias.dat"]["author"] == "Test Author"
    assert geometry.sources["parts/alias.dat"]["sha256"] == hashlib.sha256((root/"parts/alias.dat").read_bytes()).hexdigest()


def test_quads_bfc_winding_and_invertnext(root):
    dat(root, "parts/s/face.dat", "0 BFC CERTIFY CW\n4 16 0 0 0 1 0 0 1 1 0 0 1 0")
    dat(root, "parts/test.dat", "0 BFC INVERTNEXT\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 s/face.dat")
    geometry = LDrawLibrary(root).geometry("test")
    assert geometry.vertices.shape == (2,3,3)
    np.testing.assert_allclose(geometry.vertices[0], [[0,0,0],[1,0,0],[1,1,0]])
    assert geometry.colors.tolist() == [16,16]


def test_flat_primitive_reference_can_have_singular_matrix(root):
    dat(root,"p/triangle.dat","3 16 0 0 0 1 0 0 0 0 1")
    dat(root,"parts/test.dat","1 16 0 0 0 1 0 0 0 0 0 0 0 1 triangle.dat")
    assert len(LDrawLibrary(root).geometry("test").vertices) == 1


def test_lines_conditional_lines_and_direct_colors(root):
    dat(root, "parts/test.dat", "3 0x2123456 0 0 0 1 0 0 0 1 0\n2 4 0 0 0 1 0 0\n5 24 0 0 0 1 0 0 0 1 0 0 -1 0")
    library=LDrawLibrary(root)
    geometry=library.geometry("test")
    assert geometry.lines.shape==(1,2,3) and geometry.conditional_lines.shape==(1,4,3)
    assert library.color(int(geometry.colors[0]))["rgb"] == pytest.approx([0x12/255,0x34/255,0x56/255])
    with pytest.raises(LDrawError,match="not defined"):
        library.color(999999)


def test_geometry_cache_invalidates_recursive_changed_source(root):
    child=dat(root,"p/tri.dat","3 16 0 0 0 1 0 0 0 1 0")
    dat(root,"parts/test.dat","1 16 0 0 0 1 0 0 0 1 0 0 0 1 tri.dat")
    library=LDrawLibrary(root)
    before=library.geometry("test")
    assert library.geometry("test") is before
    child.write_text(child.read_text().replace("1 0 0", "22 0 0"))
    after=library.geometry("test")
    assert after is not before
    assert after.bounds[1,0]==22
    assert before.sources['p/tri.dat']['sha256']!=after.sources['p/tri.dat']['sha256']


@pytest.mark.parametrize("reference",["../outside.dat","/tmp/outside.dat","C:\\outside.dat"])
def test_reference_cannot_leave_library(root,reference):
    with pytest.raises(LDrawError,match="Unsafe"):
        LDrawLibrary(root).resolve(reference)


def test_missing_and_cyclic_dependencies_fail_without_proxy_geometry(root):
    dat(root,"parts/test.dat","1 16 0 0 0 1 0 0 0 1 0 0 0 1 missing.dat")
    library=LDrawLibrary(root)
    with pytest.raises(LDrawError,match="Missing"):
        library.geometry("test")
    dat(root,"parts/missing.dat","1 16 0 0 0 1 0 0 0 1 0 0 0 1 test.dat")
    with pytest.raises(LDrawError,match="Cyclic"):
        library.geometry("test")


def test_search_and_standalone_provenance_subset(root,tmp_path):
    dat(root,"p/tri.dat","3 16 0 0 0 1 0 0 0 1 0")
    dat(root,"parts/test.dat","1 16 0 0 0 1 0 0 0 1 0 0 0 1 tri.dat")
    dat(root,"parts/unused.dat","3 16 0 0 0 1 0 0 0 1 0")
    library=LDrawLibrary(root)
    assert library.search("test fixture")==[{"id":"test","name":"test fixture","path":"parts/test.dat"}]
    destination=tmp_path/"subset"
    manifest=library.copy_used_parts((p for p in ["test"]),destination)
    assert manifest["part_ids"]==["test"]
    assert not (destination/"parts/unused.dat").exists()
    assert (destination/"CAreadme.txt").exists()
    assert len(LDrawLibrary(destination).geometry("test").vertices)==1
    assert json.loads((destination/"source-manifest.json").read_text())==manifest
    with pytest.raises(FileExistsError):
        library.copy_used_parts(["test"],destination)


def test_texmap_prefers_explicit_fallback_without_double_geometry(root):
    dat(root,"parts/test.dat","0 !TEXMAP START PLANAR 0 0 0 1 0 0 0 1 0 texture.png\n0 !: 3 16 0 0 0 1 0 0 0 1 0\n0 !TEXMAP FALLBACK\n3 4 0 0 0 1 0 0 0 1 0\n0 !TEXMAP END")
    geometry=LDrawLibrary(root).geometry("test")
    assert len(geometry.vertices)==1 and geometry.colors.tolist()==[4]
    assert geometry.warnings


def test_renderer_uses_actual_triangles_instancing_and_embedded_revision(root,tmp_path):
    dat(root,"parts/test.dat","3 16 0 0 0 1 0 0 0 1 0\n2 24 0 0 0 1 0 0")
    library=LDrawLibrary(root)
    source=model(count=2000)
    data=preview_data(source,library)
    assert len(data["groups"])==1
    assert data["stats"]["unique_triangles"]==1
    assert data["stats"]["instanced_triangles"]==2000
    group=data["groups"][0]
    vertices=np.frombuffer(zlib.decompress(base64.b64decode(group["vertices"])),dtype='<f4').reshape(-1,10)
    np.testing.assert_allclose(vertices[:,:3],[[0,0,0],[1,0,0],[0,1,0]])
    matrices=np.frombuffer(zlib.decompress(base64.b64decode(group["matrices"])),dtype='<f4').reshape(-1,4,4)
    assert matrices[1,3,0]==20  # WebGL column-major translation slot.
    path=tmp_path/"preview.html"
    stats=write_preview(source,library,path,"A <safe> title")
    text=path.read_text()
    assert 'A &lt;safe&gt; title' in text and source['revision_id'] in text
    assert 'drawArraysInstanced' in text and 'POLYGON_OFFSET_FILL' in text
    assert stats['instances']==2000
    assert 'src="https://' not in text


def test_renderer_preserves_distinct_triangles_with_same_axis_values(root):
    dat(root,"parts/test.dat","3 16 0 0 0 1 1 0 0 1 1\n3 16 0 1 0 1 0 0 0 1 1")
    assert preview_data(model(),LDrawLibrary(root))["stats"]["unique_triangles"]==2


def test_renderer_rejects_reflections_and_wrong_schema(root):
    dat(root,"parts/test.dat","3 16 0 0 0 1 0 0 0 1 0")
    library=LDrawLibrary(root)
    source=model();source['placements'][0]['rotation'][0]=-1
    with pytest.raises(LDrawError,match="proper rigid"):
        preview_data(source,library)
    with pytest.raises(LDrawError,match="schema"):
        preview_data({"schema_version":"wrong"},library)
