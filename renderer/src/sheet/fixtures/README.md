`wps-native-spill.xlsx` is a synthetic workbook created by the locally installed
WPS ET 12.1 through its public COM `Formula2` interface. It contains only
`SEQUENCE(3,2)` at A1 and `TRANSPOSE(A1#)` at D1. Original files and accounts were
not accessed. The worksheet, formula spelling and XLDAPR metadata are the native
WPS output; author properties and the machine-generated ICV identifier were
removed/replaced before adding this regression fixture. The fixture verifies
actual foreign-package import, dependency recalculation and save/reopen.

The test compares numbers, formula ownership and dynamic ranges; it does not
claim that the WPS internal evaluator was recovered. Runtime probe provenance is
recorded in the private verification directory and the public verification
report.
