# p5.Framebuffer

A library for efficiently drawing to a texture in p5 WebGL mode.

A Framebuffer is kind of like a `p5.Graphics`: it lets you draw to a canvas, and then treat that canvas like an image. A Framebuffer, on the other hand:
- is **faster**: it shares the same WebGL context as the rest of the sketch, so it doesn't need to copy extra data to the GPU each frame
- has **more information**: you can access the WebGL depth buffer as a texture, letting you do things like write focal blur shaders
- is **WebGL only**: this will not work in 2D mode! `p5.Graphics` should be fine for that.

Read more about the motivation for this and how focal blur shaders work in <a href="https://www.davepagurek.com/blog/depth-of-field/">this blog post on the subject.</a>

## Usage

Add the library to your source code, *after* loading p5 but *before* loading your own code:

```html
<script type="text/javascript" src="p5.Framebuffer.js"></script>
```

Create a Framebuffer in `setup` and use it in `draw`:

```js
let fbo

function setup() {
  createCanvas(400, 400, WEBGL)
  fbo = createFramebuffer()
}

function draw() {
  // Draw a sphere to the Framebuffer
  fbo.draw(() => {
    clear()
    push()
    noStroke()
    fill(255, 0, 0)
    rotateX(frameCount * 0.01)
    rotateY(frameCount * 0.01)
    box(50)
    pop()
  })

  // Do something with fbo.color or dbo.depth
  texture(fbo.depth)
  plane(width, height)
}
```

Notes:
- `draw()` uses the same p5 context as the rest of your sketch! Make sure to wrap your callback code in a `push()` and `pop()` to ensure your settings don't leak out into your non-Framebuffer code.
- When you `resizeCanvas`, the Framebuffer will automatically resize accordingly. You probably will want to clear it and redraw to it if you had a texture cached.

## Examples
- `examples/simple`: Drawing both the depth and color buffers of a rotating cube
  - On the p5 editor: https://editor.p5js.org/davepagurek/sketches/cmAwY6d5W

More coming soon!
