# Generic OBJ exterior examples

These four bundles were produced by the same `lego_builder.generic.convert_obj` function with a 2,000-part target and a ±10% band. They are gray digital sculptures derived from each input's geometry. No object-name routing, animal template, vehicle template, padded base, or source-specific panel fitter is invoked.

Reproduce from the repository root after installing the project. Choose new output/work directories; existing results are never overwritten:

```sh
.venv/bin/python -m benchmarks.exterior --output outputs/generic-reproduction --work-dir outputs/generic-reproduction-work
```

The committed bundles were generated with `--output examples/generic --work-dir outputs/generic-benchmark-work`. The default library is the bundled official LDraw subset in `lego_builder/data/parts-library`. The harness exits with failure if a conversion fails, the count misses 1,800–2,200 parts, source hashes or artifact checks disagree, reserved grid envelopes overlap, or distinct input geometries produce identical placement sets.

| Case | Source / up axis | Parts / lots | Runtime (s) | Reserved-cell overlaps | Continuous envelope distance median / p95 (LDU) | Raster silhouette IoU XY / XZ / YZ |
| --- | --- | --- | --- | --- | --- | --- |
| [cat](cat/preview.html) | original supplied cat OBJ / z | 1965 / 21 | 1.43 | 0 | 12.13 / 20.50 | 1.0000 / 0.9955 / 0.9987 |
| [bottle](bottle/preview.html) | procedural revolved bottle / z | 1984 / 17 | 0.46 | 0 | 13.01 / 20.01 | 1.0000 / 1.0000 / 1.0000 |
| [rounded](rounded/preview.html) | procedural rounded ellipsoid / y | 1929 / 19 | 0.41 | 0 | 12.51 / 19.66 | 1.0000 / 1.0000 / 1.0000 |
| [cybertruck](cybertruck/preview.html) | original supplied OBJ under neutral filename / y | 2063 / 21 | 4.17 | 0 | 8.18 / 18.35 | 1.0000 / 1.0000 / 0.9948 |

The cat is the original supplied OBJ. The bottle is a locally generated revolved shape. The rounded fixture is an ellipsoid-like procedural object; its historical filename `rounded_vase.obj` does not imply a hollow vase or a source scan. Both small procedural inputs are explicitly labeled in `benchmarks/fixtures`.

The Cybertruck input is copied byte-for-byte from the original supplied OBJ into the ignored benchmark work directory as `neutral_object.obj`; its checksum is verified against the original. The large source is never copied into these tracked examples. This demonstrates that the shared call uses geometry under a neutral filename. The generic Cybertruck sculpture is separate from `examples/cybertruck`, which uses the explicitly source-specific panel fitter and richer vehicle detailing.

Each bundle contains canonical placements, matching LDraw, JSON/CSV inventory, a component index, validation report and an interactive actual-part preview. `sequence.json` is a component index, not verified building instructions. `summary.json` binds every result to its canonical revision, placement-set fingerprint, source hash, algorithm, implementation file hashes and catalog dependency hashes. `summary.csv` provides the same case measurements for comparison.

Metrics have different scopes. **Reserved-cell overlap** is the fitter's rectangular-envelope bookkeeping; it is not a full triangle collision or physical connection test. **Raster silhouette IoU** compares covered shell projections with sampled source-triangle projections at the selected grid pitch. **Continuous distance** samples inferred exterior-envelope faces against nearest original continuous input triangles; it does not measure the final LEGO surfaces. A slope can remove material inside its reserved rectangular envelope. None of these metrics establishes perceptual resemblance, universal artistic quality, clutch engagement, connectivity, strength or feasible assembly.

The envelope uses conservative triangle-box sampling and bounded one-cell closing; small gaps may close and enclosed voids can fill. All assumptions, repairs, inferred cells, count-search attempts and fidelity scope are recorded in each model's provenance. Model colors ignore source materials. Studio imports and physical builds remain unverified.

Run outcome: **4/4 case checks passed**. Distinct placement sets: **4**. Implementation unchanged during the run: **True**.
