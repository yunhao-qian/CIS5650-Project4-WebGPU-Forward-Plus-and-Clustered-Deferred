// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@vertex
fn main(@builtin(vertex_index) index: u32) -> VertexOutput {
    // Use an oversized triangle to cover the screen.
    let positions = array<vec2f, 3>(
        vec2f(-1.0, -1.0),
        vec2f( 3.0, -1.0),
        vec2f(-1.0,  3.0)
    );
    let texCoords = array<vec2f, 3>(
        vec2f(0.0, 0.0),
        vec2f(2.0, 0.0),
        vec2f(0.0, 2.0)
    );

    var out: VertexOutput;
    out.fragPos = vec4f(positions[index], 0.0, 1.0);
    out.uv = texCoords[index];
    return out;
};
