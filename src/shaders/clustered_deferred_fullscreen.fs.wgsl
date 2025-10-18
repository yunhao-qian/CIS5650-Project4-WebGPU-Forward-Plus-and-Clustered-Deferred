// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_gBuffer}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var normalTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var depthTex: texture_depth_2d;
@group(${bindGroup_gBuffer}) @binding(3) var texSampler: sampler;

@group(${bindGroup_clusterSet}) @binding(0) var<storage, read> clusterSet: ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    // NDC: +y is up; texture: +y is down.
    let uv = vec2f(in.uv.x, 1.0 - in.uv.y);

    let albedo = textureSample(albedoTex, texSampler, uv).xyz;
    let normal = textureSample(normalTex, texSampler, uv).xyz;
    let depth = textureLoad(depthTex, vec2<i32>(in.fragPos.xy), 0);

    let ndcPosition = vec4f(in.uv * 2.0f - 1.0f, depth, 1.0f);
    let viewPositionH = cameraUniforms.invProjMat * ndcPosition;
    let viewPosition = viewPositionH.xyz / viewPositionH.w;

    let viewNormal = normalize((cameraUniforms.viewMat * vec4f(normal, 0.0f)).xyz);

    let clusterIndex = computeClusterIndex(in.fragPos, viewPosition, clusterSet.numClustersX, clusterSet.numClustersY);
    let numLights = clusterSet.clusters[clusterIndex].numLights;

    var totalLightContrib = vec3f(0.0f, 0.0f, 0.0f);
    for (var lightIdx = 0u; lightIdx < numLights; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIndex].lightIndices[lightIdx]];
        let lightViewPosition = (cameraUniforms.viewMat * vec4f(light.pos, 1.0)).xyz;

        let vectorToLight = lightViewPosition - viewPosition;
        let distanceToLight = length(vectorToLight);

        let lambert = max(dot(viewNormal, normalize(vectorToLight)), 0.0f);
        totalLightContrib += light.color * lambert * rangeAttenuation(distanceToLight);
    }

    let finalColor = albedo * totalLightContrib;
    return vec4f(albedo * totalLightContrib, 1.0f);
}
