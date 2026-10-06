# Third-party notices

Personal Life OS is licensed under the GNU AGPL v3.0 (see [LICENSE](LICENSE)). It bundles the following third-party data, each under its own license.

## Exercise catalog — hasaneyldrm/exercises-dataset

`src/modules/health/data/exercise-catalog.json` is generated (by `scripts/build-exercise-catalog.mjs`) from the exercise names, categories, equipment, muscle and English instruction data of [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset). Only the MIT-licensed data and instruction text are used. The dataset's images and animations are © Gym visual (https://gymvisual.com/), are **not** covered by its MIT license, and are **not** included in this project.

```
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Body-map outlines — MuscleMap

The muscle outline paths used by the gym muscle map are converted from the SVG path data of [MuscleMap](https://github.com/melihcolpan/MuscleMap) by Melih Colpan (Swift source converted to a TypeScript module; sub-group shapes dropped; artwork otherwise unchanged).

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Feature reference — openGym

The gym feature set was designed with reference to [openGym](https://github.com/arvids-unavailable/openGym) by Duarte Santos (GNU AGPL v3.0). No openGym source files are included; see `docs/prd/health/gym.md`.
