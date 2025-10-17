// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(1) @binding(0) var<storage, read> lightSet: LightSet;
@group(1) @binding(1) var<storage, read_write> clusterSet: ClusterSet;

fn computeRayDirection(ndcX: f32, ndcY: f32) -> vec3f {
    let position = cameraUniforms.invProjMat * vec4f(ndcX, ndcY, 1.0f, 1.0f);
    return normalize(position.xyz / position.w); 
}

fn isSphereIntersectingFrustum(normals: array<vec3f, 6>, offsets: array<f32, 6>, center: vec3f, radius: f32) -> bool {
    for (var i: u32 = 0u; i < 6u; i += 1u) {
        let distance = dot(normals[i], center) - offsets[i];
        if (distance > radius) {
            return false;
        }
    }
    return true;
}

@compute @workgroup_size(${clusteringWorkGroupSize})
fn main(@builtin(global_invocation_id) globalID: vec3u) {
    let sizeYZ = clusterSet.numClustersY * ${numClustersZ};
    let sizeXYZ = clusterSet.numClustersX * sizeYZ;
    let indexXYZ = globalID.x;
    if (indexXYZ >= sizeXYZ) {
        return;
    }
    let indexX = indexXYZ / sizeYZ;
    let indexYZ = indexXYZ - indexX * sizeYZ;
    let indexY = indexYZ / ${numClustersZ};
    let indexZ = indexYZ - indexY * ${numClustersZ};

    // [-1, 1] NDC coordinates
    let xMin = f32(indexX) / f32(clusterSet.numClustersX) * 2.0f - 1.0f;
    let xMax = f32(indexX + 1u) / f32(clusterSet.numClustersX) * 2.0f - 1.0f;
    let yMin = f32(indexY) / f32(clusterSet.numClustersY) * 2.0f - 1.0f;
    let yMax = f32(indexY + 1u) / f32(clusterSet.numClustersY) * 2.0f - 1.0f;

    // Linear depth values (positive)
    let zNear = mix(${clusterNear}, ${clusterFar}, f32(indexZ) / f32(${numClustersZ}));
    let zFar = mix(${clusterNear}, ${clusterFar}, f32(indexZ + 1u) / f32(${numClustersZ}));

    // Ray directions for the four corners of the frustum (view space)
    let rayBL = computeRayDirection(xMin, yMin); // bottom-left
    let rayBR = computeRayDirection(xMax, yMin); // bottom-right
    let rayTL = computeRayDirection(xMin, yMax); // top-left
    let rayTR = computeRayDirection(xMax, yMax); // top-right

    // Plane normals (view space)
    let planeNormals = array<vec3f, 6>(
        vec3f(0.0f, 0.0f, 1.0f), // near
        vec3f(0.0f, 0.0f, -1.0f), // far
        normalize(cross(rayTL, rayBL)), // left
        normalize(cross(rayBR, rayTR)), // right
        normalize(cross(rayBL, rayBR)), // bottom
        normalize(cross(rayTR, rayTL))  // top
    );
    // dot(normal, point) - offset > 0 => outside plane
    let planeOffsets = array<f32, 6>(
        -zNear,  // near
        zFar,   // far
        0.0f,     // left
        0.0f,     // right
        0.0f,     // bottom
        0.0f      // top
    );

    var numLights: u32 = 0u;
    for (var i: u32 = 0u; i < lightSet.numLights && numLights < ${maxLightsPerCluster}; i += 1u) {
        let light = lightSet.lights[i];
        // View space position of the light
        let position = (cameraUniforms.viewMat * vec4f(light.pos, 1.0f)).xyz;
        if (isSphereIntersectingFrustum(planeNormals, planeOffsets, position, ${lightRadius})) {
            clusterSet.clusters[indexXYZ].lightIndices[numLights] = i;
            numLights += 1u;
        }
    }
    clusterSet.clusters[indexXYZ].numLights = numLights;
}
