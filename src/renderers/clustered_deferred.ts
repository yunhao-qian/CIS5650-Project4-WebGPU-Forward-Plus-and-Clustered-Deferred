import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ClusteredDeferredRenderer extends renderer.Renderer {
    // TODO-3: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;

    clusterSetBindGroupLayout: GPUBindGroupLayout
    clusterSetBindGroup: GPUBindGroup;

    gBufferBindGroupLayout: GPUBindGroupLayout;
    gBufferBindGroup: GPUBindGroup;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    albedoTexture: GPUTexture;
    albedoTextureView: GPUTextureView;

    normalTexture: GPUTexture;
    normalTextureView: GPUTextureView;

    texSampler: GPUSampler;

    geometryPipeline: GPURenderPipeline;
    lightingPipeline: GPURenderPipeline;

    constructor(stage: Stage) {
        super(stage);

        // TODO-3: initialize layouts, pipelines, textures, etc. needed for Forward+ here
        // you'll need two pipelines: one for the G-buffer pass and one for the fullscreen pass
        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "scene uniforms bind group layout",
            entries: [
                {
                    // Uniforms
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    // lightSet
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.camera.uniformsBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.lights.lightSetStorageBuffer },
                },
            ],
        });

        this.clusterSetBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "cluster set bind group layout",
            entries: [
                {
                    // clusterSet
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "read-only-storage" },
                },
            ],
        });

        this.clusterSetBindGroup = renderer.device.createBindGroup({
            label: "cluster set bind group",
            layout: this.clusterSetBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.lights.clusterSetStorageBuffer },
                },
            ],
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.depthTextureView = this.depthTexture.createView();

        this.albedoTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.albedoTextureView = this.albedoTexture.createView();

        this.normalTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.normalTextureView = this.normalTexture.createView();

        this.texSampler = renderer.device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest',
            mipmapFilter: 'nearest',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            addressModeW: 'clamp-to-edge',
        });

        this.gBufferBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "G-buffer bind group layout",
            entries: [
                {
                    // albedo
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    // normal
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    // depth
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" },
                },
                {
                    // sampler
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
            ],
        });

        this.gBufferBindGroup = renderer.device.createBindGroup({
            label: "G-buffer bind group",
            layout: this.gBufferBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.albedoTextureView,
                },
                {
                    binding: 1,
                    resource: this.normalTextureView,
                },
                {
                    binding: 2,
                    resource: this.depthTextureView,
                },
                {
                    binding: 3,
                    resource: this.texSampler,
                },
            ],
        });

        this.geometryPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "geometry pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout,
                ],
            }),
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred geometry vert shader",
                    code: shaders.naiveVertSrc,
                }),
                buffers: [renderer.vertexBufferLayout],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred geometry frag shader",
                    code: shaders.clusteredDeferredFragSrc,
                }),
                targets: [
                    {
                        format: "rgba8unorm", // albedo
                    },
                    {
                        format: "rgba16float", // normal
                    },
                ],
            },
        });

        this.lightingPipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "lighting pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    this.gBufferBindGroupLayout,
                    null,
                    this.clusterSetBindGroupLayout,
                ],
            }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc,
                }),
                buffers: [],
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "clustered deferred lighting frag shader",
                    code: shaders.clusteredDeferredFullscreenFragSrc,
                }),
                targets: [
                    {
                        format: renderer.canvasFormat,
                    },
                ],
            },
        });
    }

    override draw() {
        // TODO-3: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the G-buffer pass, outputting position, albedo, and normals
        // - run the fullscreen pass, which reads from the G-buffer and performs lighting calculations
        const encoder = renderer.device.createCommandEncoder();
        const canvasTextureView = renderer.context
            .getCurrentTexture()
            .createView();

        this.lights.doLightClustering(encoder);

        const geometryPass = encoder.beginRenderPass({
            label: "clustered deferred geometry pass",
            colorAttachments: [
                {
                    view: this.albedoTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: this.normalTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        geometryPass.setPipeline(this.geometryPipeline);

        geometryPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(
            node => {
                geometryPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
            },
            material => {
                geometryPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
            },
            primitive => {
                geometryPass.setVertexBuffer(0, primitive.vertexBuffer);
                geometryPass.setIndexBuffer(primitive.indexBuffer, "uint32");
                geometryPass.drawIndexed(primitive.numIndices);
            },
        );

        geometryPass.end();

        const lightingPass = encoder.beginRenderPass({
            label: "clustered deferred lighting pass",
            colorAttachments: [
                {
                    view: canvasTextureView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        lightingPass.setPipeline(this.lightingPipeline);

        lightingPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);
        lightingPass.setBindGroup(shaders.constants.bindGroup_gBuffer, this.gBufferBindGroup);
        lightingPass.setBindGroup(shaders.constants.bindGroup_clusterSet, this.clusterSetBindGroup);

        lightingPass.draw(3);

        lightingPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
