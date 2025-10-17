// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    numClustersX: u32,
    numClustersY: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4<f32>,
    invProjMat: mat4x4f,
    viewMat: mat4x4<f32>,
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

fn computeIndexZ(viewZ: f32) -> u32 {
    let z = -viewZ; // positive
    let index = (z - ${clusterNear}) / (${clusterFar} - ${clusterNear}) * f32(${numClustersZ});
    return u32(clamp(index, 0.f, f32(${numClustersZ} - 0.5f)));
}

fn computeClusterIndex(fragPosition: vec4f, viewPosition: vec3f, numClustersX: u32, numClustersY: u32) -> u32 {
    let indexX = u32(fragPosition.x / f32(${clusterPixelSize}));
    let indexY = u32(fragPosition.y / f32(${clusterPixelSize}));
    let indexZ = computeIndexZ(viewPosition.z);
    return (indexX * numClustersY + indexY) * ${numClustersZ} + indexZ;
}
