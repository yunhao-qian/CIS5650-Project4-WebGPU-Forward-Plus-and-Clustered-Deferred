import { vec3 } from "wgpu-matrix";
import { canvas, device } from "../renderer";

import * as shaders from '../shaders/shaders';
import { Camera } from "./camera";

// h in [0, 1]
function hueToRgb(h: number) {
    let f = (n: number, k = (n + h * 6) % 6) => 1 - Math.max(Math.min(k, 4 - k, 1), 0);
    return vec3.lerp(vec3.create(1, 1, 1), vec3.create(f(5), f(3), f(1)), 0.8);
}

export class Lights {
    private camera: Camera;

    numLights = 1000;
    static readonly maxNumLights = 5000;
    static readonly numFloatsPerLight = 8; // vec3f is aligned at 16 byte boundaries

    static readonly lightIntensity = 0.1;

    lightsArray = new Float32Array(Lights.maxNumLights * Lights.numFloatsPerLight);
    lightSetStorageBuffer: GPUBuffer;

    timeUniformBuffer: GPUBuffer;

    moveLightsComputeBindGroupLayout: GPUBindGroupLayout;
    moveLightsComputeBindGroup: GPUBindGroup;
    moveLightsComputePipeline: GPUComputePipeline;

    // TODO-2: add layouts, pipelines, textures, etc. needed for light clustering here
    numClusters: number;

    sceneUniformsComputeBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsComputeBindGroup: GPUBindGroup;

    clusterSetStorageBuffer: GPUBuffer;
    clusteredLightsComputeBindGroupLayout: GPUBindGroupLayout;
    clusterLightsComputeBindGroup: GPUBindGroup;

    clusteringComputePipeline: GPUComputePipeline;

    constructor(camera: Camera) {
        this.camera = camera;

        this.lightSetStorageBuffer = device.createBuffer({
            label: "lights",
            size: 16 + this.lightsArray.byteLength, // 16 for numLights + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.populateLightsBuffer();
        this.updateLightSetUniformNumLights();

        this.timeUniformBuffer = device.createBuffer({
            label: "time uniform",
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.moveLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "move lights compute bind group layout",
            entries: [
                { // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }
                },
                { // time
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }
                }
            ]
        });

        this.moveLightsComputeBindGroup = device.createBindGroup({
            label: "move lights compute bind group",
            layout: this.moveLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer }
                },
                {
                    binding: 1,
                    resource: { buffer: this.timeUniformBuffer }
                }
            ]
        });

        this.moveLightsComputePipeline = device.createComputePipeline({
            label: "move lights compute pipeline",
            layout: device.createPipelineLayout({
                label: "move lights compute pipeline layout",
                bindGroupLayouts: [this.moveLightsComputeBindGroupLayout]
            }),
            compute: {
                module: device.createShaderModule({
                    label: "move lights compute shader",
                    code: shaders.moveLightsComputeSrc
                }),
                entryPoint: "main"
            }
        });

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for light clustering here
        this.sceneUniformsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "scene uniforms compute bind group layout",
            entries: [
                {
                    // Uniforms
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this.sceneUniformsComputeBindGroup = device.createBindGroup({
            label: "scene uniforms compute bind group",
            layout: this.sceneUniformsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
            ],
        });

        const numClustersX = Math.ceil(canvas.width / shaders.constants.clusterPixelSize);
        const numClustersY = Math.ceil(canvas.height / shaders.constants.clusterPixelSize);
        this.numClusters = numClustersX * numClustersY * shaders.constants.numClustersZ;

        this.clusterSetStorageBuffer = device.createBuffer({
            label: "clustered lights",
            size: (
                4 + // numClustersX
                4 + // numClustersY
                this.numClusters * (
                    1 + // numLights
                    shaders.constants.maxLightsPerCluster // light indices
                ) * 4 // bytes per u32
            ),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        device.queue.writeBuffer(this.clusterSetStorageBuffer, 0, new Uint32Array([numClustersX, numClustersY]));
        // `clusters` will be populated in the compute shader.

        this.clusteredLightsComputeBindGroupLayout = device.createBindGroupLayout({
            label: "clustered lights compute bind group layout",
            entries: [
                {
                    // lightSet
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" },
                },
                {
                    // clusterSet
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" },
                }
            ],
        });

        this.clusterLightsComputeBindGroup = device.createBindGroup({
            label: "cluster lights compute bind group",
            layout: this.clusteredLightsComputeBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lightSetStorageBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.clusterSetStorageBuffer },
                }
            ],
        });

        this.clusteringComputePipeline = device.createComputePipeline({
            label: "clustering compute pipeline",
            layout: device.createPipelineLayout({
                label: "clustering compute pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsComputeBindGroupLayout,
                    this.clusteredLightsComputeBindGroupLayout
                ],
            }),
            compute: {
                module: device.createShaderModule({
                    label: "clustering compute shader",
                    code: shaders.clusteringComputeSrc,
                }),
                entryPoint: "main",
            },
        });
    }

    private populateLightsBuffer() {
        for (let lightIdx = 0; lightIdx < Lights.maxNumLights; ++lightIdx) {
            // light pos is set by compute shader so no need to set it here
            const lightColor = vec3.scale(hueToRgb(Math.random()), Lights.lightIntensity);
            this.lightsArray.set(lightColor, (lightIdx * Lights.numFloatsPerLight) + 4);
        }

        device.queue.writeBuffer(this.lightSetStorageBuffer, 16, this.lightsArray);
    }

    updateLightSetUniformNumLights() {
        device.queue.writeBuffer(this.lightSetStorageBuffer, 0, new Uint32Array([this.numLights]));
    }

    doLightClustering(encoder: GPUCommandEncoder) {
        // TODO-2: run the light clustering compute pass(es) here
        // implementing clustering here allows for reusing the code in both Forward+ and Clustered Deferred

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.clusteringComputePipeline);

        computePass.setBindGroup(0, this.sceneUniformsComputeBindGroup);
        computePass.setBindGroup(1, this.clusterLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numClusters / shaders.constants.clusteringWorkGroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();
    }

    // CHECKITOUT: this is where the light movement compute shader is dispatched from the host
    onFrame(time: number) {
        device.queue.writeBuffer(this.timeUniformBuffer, 0, new Float32Array([time]));

        // not using same encoder as render pass so this doesn't interfere with measuring actual rendering performance
        const encoder = device.createCommandEncoder();

        const computePass = encoder.beginComputePass();
        computePass.setPipeline(this.moveLightsComputePipeline);

        computePass.setBindGroup(0, this.moveLightsComputeBindGroup);

        const workgroupCount = Math.ceil(this.numLights / shaders.constants.moveLightsWorkgroupSize);
        computePass.dispatchWorkgroups(workgroupCount);

        computePass.end();

        device.queue.submit([encoder.finish()]);
    }
}
