# WebGL Forward+ and Clustered Deferred Shading

University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4

- (TODO) YOUR NAME HERE
- Tested on: (TODO) **Google Chrome 222.2** on
  Windows 22, i7-2222 @ 2.22GHz 22GB, GTX 222 222MB (Moore 2222 Lab)

## Live Demo

[![Screenshot](images/Screenshot.png)](https://yunhao-qian.github.io/showcase/webgpu-light-clustering)

## Demo Video/GIF

<https://github.com/user-attachments/assets/ba904a32-6666-4b92-bd17-68923327566e>

## Implementation Details

### Naive Forward Shading

`naive.ts` implements a straightforward forward shading approach.

In the vertex shader, vertex positions are transformed from model space to clip space. To enable reuse in later parts, `naive.vs.wgsl` includes an additional output variable, `viewPos`, which stores the vertex position in view space. This avoids recomputing depths in later passes, improving precision and performance.

In the fragment shader, all lights are iterated over. For each light, its contribution to the current fragment is computed and accumulated to produce the final color output.

### Forward+ Shading

`forward_plus.ts` implements the Forward+ shading technique, which improves performance by clustering lights in the view frustum.

- The camera's view frustum is divided into a 3D grid. The x and y axes are split into fixed-size slices in screen space (pixels), and the z axis is divided into a fixed number of slices at uniform depth intervals between the near and far clip planes.
- Each 3D cell in this grid is called a “cluster.” For each cluster, a list of potentially affecting lights is precomputed. Two assumptions are used:  
  1. A light only affects geometry within its radius.  
  2. A cluster includes any point light whose center lies within its radius of any of the cluster's six bounding planes.
- The indices of lights affecting each cluster are stored in a GPU buffer, along with a count of lights per cluster. The buffer is preallocated for up to 511 lights per cluster (one slot reserved for the count).
- In the fragment shader, instead of looping through all lights, the shader determines which cluster the fragment belongs to and only evaluates the lights assigned to that cluster.

Performance: see the Performance Analysis section below.

- The rendering time still grows with the number of lights, but at a much slower rate, as the light clustering pass takes small amount of time compared to the overall rendering time.
- To further optimize, we could consider using a more sophisticated light grouping strategy, such as joining nearby cluster to share lights, or using a more advanced data structure than a flat array to store lights.

### Clustered Deferred Shading

`clustered_deferred.ts` implements the Clustered Deferred Shading technique, reusing the same light clustering process from the Forward+ implementation but switching to a deferred rendering pipeline.

- Geometry pass: The scene is rendered into multiple G-buffers, including depth, albedo, and world-space normal. The depth buffer uses the existing depth attachment, while the albedo and normal buffers are separate color attachments.
- Lighting pass: A full-screen primitive (typically a single large triangle covering the viewport) is rendered. In the fragment shader, the G-buffers are sampled to retrieve view-space position, albedo, and normal data. These vectors are converted to camera space, the fragment's cluster is determined, and the shader loops through the lights in that cluster to accumulate lighting contributions in camera space. The accumulated result gives the final shaded color for each pixel.

Performance: see the Performance Analysis section below.

- Again, the rendering time grows with the number of light, but the growth rate is slower compared to Forward+ shading.
- This is because deferred shading only processes visible fragments for lighting calculations, and for our scene, the extra overhead of the geometry pass is light compared to the savings from reduced lighting calculations.

## Performance Analysis

![performance](performance.png)

| Number of Lights  | Naive (ms) | Forward+ (ms) | Clustered Deferred (ms)   |
|------------------:|-----------:|---------------:|-------------------------:|
| 250               | 132.34     | 17.60          | 16.61                    |
| 500               | 263.17     | 18.62          | 16.65                    |
| 1000              | -          | 34.86          | 18.92                    |
| 2000              | -          | 58.50          | 34.42                    |
| 4000              | -          | 110.67         | 59.17                    |

We measure frame intervals in milliseconds using JavaScript, averaging results over at least 100 frames. Since the naive method performs far worse than the Forward+ and Clustered Deferred shading techniques, it is excluded from this performance comparison.

When the number of lights is small, both Forward+ and Clustered Deferred shading achieve frame rates above the screen's refresh limit, so the performance difference is negligible. As the number of lights increases, however, the gap widens—Clustered Deferred shading consistently outperforms Forward+ shading, particularly at higher light counts.

This is likely because Clustered Deferred shading processes only visible fragments, avoiding redundant shading work for pixels that do not contribute to the final image. As light count increases, lighting computations dominate the frame time. Clustered Deferred shading performs this computation once per pixel, while Forward+ shading may repeat the work for each overlapping fragment.

From this analysis, the tradeoffs between the two methods become clear:

- **Forward+ shading** is simpler and provides good performance for many scenes without the added complexity of a deferred pipeline. When the scene is simple, this simplicity may even lead to better performance.
- **Clustered Deferred shading** excels in scenes like the one used here, where:
  - The scene is geometrically complex, with multiple overlapping fragments per pixel, amplifying deferred shading's efficiency.  
  - The scene includes many dynamic lights, making lighting calculations the main bottleneck and allowing clustered light culling to yield greater benefits.

## Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
