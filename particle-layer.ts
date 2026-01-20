import {
  Color,
  DefaultProps,
  LayerContext,
  UpdateParameters,
} from "@deck.gl/core";
import { LineLayer, LineLayerProps } from "@deck.gl/layers";
import { Buffer, Texture } from "@luma.gl/core";
import { Model, BufferTransform } from "@luma.gl/engine";
import shader from "./particle-layer-update-transform.vs.glsl.js";
import { ShaderModule } from "@luma.gl/shadertools";

// Shader Module

export type UniformProps = {
  numParticles: number;
  maxAge: number;
  speedFactor: number;
  time: number;
  seed: number;
  viewportBounds: number[];
  viewportZoomChangeFactor: number;
  imageUnscale: number[];
  bounds: number[];
  blend: number;
  bitmapTexture: Texture;
  bitmapTextureNext: Texture;
};

const uniformBlock = `\
uniform bitmapUniforms {
  float numParticles;
  float maxAge;
  float speedFactor;
  float time;
  float seed;
  vec4 viewportBounds;
  float viewportZoomChangeFactor;
  vec2 imageUnscale;
  vec4 bounds;
  float blend;
} bitmap;
`;

export const bitmapUniforms = {
  name: "bitmap",
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    numParticles: "f32",
    maxAge: "f32",
    speedFactor: "f32",
    time: "f32",
    seed: "f32",
    // @ts-ignore
    viewportBounds: "vec4<f32>",
    viewportZoomChangeFactor: "f32",
    imageUnscale: "vec2<f32>",
    bounds: "vec4<f32>",
    blend: "f32",
  },
} as const satisfies ShaderModule<UniformProps>;

// Particle Layer

const FPS = 30;
const DEFAULT_COLOR: [number, number, number, number] = [255, 255, 255, 255];

export type Bbox = [number, number, number, number];

export type ParticleLayerProps<D = unknown> = LineLayerProps<D> & {
  image: string | Texture | null;
  imageNext?: string | Texture | null;
  blend?: number;
  bounds: number[];
  imageUnscale: number[];
  numParticles: number;
  maxAge: number;
  speedFactor: number;
  color: Color;
  width: number;
  animate?: boolean;
  wrapLongitude: boolean;
};

const defaultProps: DefaultProps<ParticleLayerProps> = {
  ...LineLayer.defaultProps,

  image: { type: "image", value: null, async: true },
  imageNext: { type: "image", value: null, async: true },
  blend: { type: "number", min: 0, max: 1, value: 0 },
  imageUnscale: { type: "array", value: null },

  numParticles: { type: "number", min: 1, max: 1000000, value: 5000 },
  maxAge: { type: "number", min: 1, max: 255, value: 100 },
  speedFactor: { type: "number", min: 0, max: 255, value: 1 },

  color: { type: "color", value: DEFAULT_COLOR },
  width: { type: "number", value: 1 },
  animate: { type: "boolean", value: true },

  bounds: { type: "array", value: [-180, -90, 180, 90], compare: true },
  wrapLongitude: true,
};

export default class ParticleLayer<
  D = any,
  ExtraPropsT = ParticleLayerProps<D>
> extends LineLayer<D, ExtraPropsT & ParticleLayerProps<D>> {
  state!: {
    model?: Model;
    initialized: boolean;
    numInstances: number;
    numAgedInstances: number;
    sourcePositions: Buffer;
    targetPositions: Buffer;
    sourcePositions64Low: Float32Array;
    targetPositions64Low: Float32Array;
    colors: Buffer;
    widths: Float32Array;
    transform: BufferTransform;
    previousViewportZoom: number;
    previousFrame: number;
    texture: Texture;
    textureNext: Texture;
    stepRequested: boolean;
  };

  // Speed-colored particles (expects speed magnitude normalized 0..1 stored in instanceTargetPositions.z)
  getShaders() {
    const oldShaders = super.getShaders();
    return {
      ...oldShaders,
      inject: {
        "vs:#decl": `
          out float drop;
          out float vSpeed;
          const vec2 DROP_POSITION = vec2(0);
        `,
        "vs:#main-start": `
          drop = float(instanceSourcePositions.xy == DROP_POSITION ||
                       instanceTargetPositions.xy == DROP_POSITION);
          vSpeed = clamp(instanceTargetPositions.z, 0.0, 1.0);
        `,
        "fs:#decl": `
          in float drop;
          in float vSpeed;

          // Nullschool-like colormap: cyan -> green -> yellow -> orange -> red
          vec3 nullschoolColormap(float t) {
            t = clamp(t, 0.0, 1.0);

            if (t < 0.25) {
              return mix(vec3(0.0, 0.8, 1.0),
                         vec3(0.0, 1.0, 0.4),
                         t / 0.25);
            } else if (t < 0.5) {
              return mix(vec3(0.0, 1.0, 0.4),
                         vec3(1.0, 1.0, 0.0),
                         (t - 0.25) / 0.25);
            } else if (t < 0.75) {
              return mix(vec3(1.0, 1.0, 0.0),
                         vec3(1.0, 0.5, 0.0),
                         (t - 0.5) / 0.25);
            } else {
              return mix(vec3(1.0, 0.5, 0.0),
                         vec3(0.9, 0.0, 0.0),
                         (t - 0.75) / 0.25);
            }
          }
        `,
        "fs:#main-start": `
          if (drop > 0.5) discard;
        `,
        "fs:DECKGL_FILTER_COLOR": `
          vec3 rgb = nullschoolColormap(vSpeed);
          color.rgb = rgb;
        `,
      },
    };
  }

  initializeState() {
    const color = this.props.color;
    super.initializeState();
    const attributeManager = this.getAttributeManager();
    attributeManager!.remove([
      "instanceSourcePositions",
      "instanceTargetPositions",
      "instanceColors",
      "instanceWidths",
    ]);
    attributeManager!.addInstanced({
      instanceSourcePositions: {
        size: 3,
        type: "float32",
        noAlloc: !0,
      },
      instanceTargetPositions: {
        size: 3,
        type: "float32",
        noAlloc: !0,
      },
      instanceColors: {
        size: 4,
        type: "float32",
        noAlloc: !0,
        defaultValue: [color[0], color[1], color[2], color[3]],
      },
    });

    this.setState({ initialized: false } as any);
  }

  updateState({
    props,
    oldProps,
    changeFlags,
    context,
  }: UpdateParameters<this>) {
    super.updateState({
      props,
      oldProps,
      changeFlags,
      context,
    } as UpdateParameters<this>);
    const { numParticles, maxAge, width, image, imageNext } = props;
    if (!numParticles || !maxAge || !width) {
      this._deleteTransformFeedback();
      return;
    }

    const imageIsTexture = image && typeof image !== "string";
    const imageNextIsTexture = imageNext && typeof imageNext !== "string";

    // (A) init once textures are available (or fall back to current)
    if (!this.state.initialized) {
      if (imageIsTexture) {
        this._setupTransformFeedback();
      }
      return;
    }

    // (B) rebuild buffers only when structure changes
    if (
      numParticles !== oldProps.numParticles ||
      maxAge !== oldProps.maxAge ||
      width !== oldProps.width
    ) {
      this._setupTransformFeedback();
      return;
    }

    // (C) update textures without resetting particles (smooth)
    // Deck.gl async image prop will switch from URL string -> Texture, and then change on new URL.
    if (imageIsTexture && image !== oldProps.image) {
      (image as Texture).setSampler({ minFilter: "linear", magFilter: "linear" });
      const updates: Partial<typeof this.state> = {
        texture: image as Texture,
      };
      if (!imageNextIsTexture) {
        updates.textureNext = image as Texture;
      }
      this.setState(updates as any);
    }

    if (imageNextIsTexture && imageNext !== oldProps.imageNext) {
      (imageNext as Texture).setSampler({
        minFilter: "linear",
        magFilter: "linear",
      });
      this.setState({ textureNext: imageNext as Texture } as any);
    }
  }

  finalizeState(context: LayerContext) {
    this._deleteTransformFeedback();

    super.finalizeState(context);
  }

  draw({ uniforms }: { uniforms: any }) {
    const { initialized } = this.state;
    if (!initialized) {
      return;
    }

    const { animate } = this.props;
    const {
      sourcePositions,
      targetPositions,
      sourcePositions64Low,
      targetPositions64Low,
      colors,
      widths,
      model,
    } = this.state;
    model.setAttributes({
      instanceSourcePositions: sourcePositions,
      instanceTargetPositions: targetPositions,
      instanceColors: colors,
    });
    model.setConstantAttributes({
      instanceSourcePositions64Low: sourcePositions64Low,
      instanceTargetPositions64Low: targetPositions64Low,
      instanceWidths: widths,
    });

    super.draw({ uniforms });

    if (animate) {
      this.requestStep();
    }
  }

  _setupTransformFeedback() {
    const { initialized } = this.state;
    if (initialized) {
      this._deleteTransformFeedback();
    }

    const { image, imageNext, numParticles, color, maxAge, width } = this.props;
    if (typeof image === "string" || image === null) {
      return;
    }
    const texNext =
      typeof imageNext === "string" || imageNext === null
        ? (image as Texture)
        : (imageNext as Texture);

    (image as Texture).setSampler({ minFilter: "linear", magFilter: "linear" });
    texNext.setSampler({ minFilter: "linear", magFilter: "linear" });

    // Buffer layout groups particles by age.
    // So all the youngest particles, followed by the next oldest, etc.
    // After the the transform runs (one age complete) we shift all the buffers down.
    // The oldest has shifted and the blank area at the start becomes the youngest in the next transform.
    const numInstances = numParticles * maxAge;
    const numAgedInstances = numParticles * (maxAge - 1);
    const sourcePositions = this.context.device.createBuffer(
      new Float32Array(numInstances * 3)
    );
    const targetPositions = this.context.device.createBuffer(
      new Float32Array(numInstances * 3)
    );

    const colors = this.context.device.createBuffer(
      new Float32Array(
        new Array(numInstances)
          .fill(undefined)
          .map((_, i) => {
            const age = Math.floor(i / numParticles);
            return [
              color[0],
              color[1],
              color[2],
              (color[3] ?? 255) * (1 - age / maxAge),
            ].map((d) => d / 255);
          })
          .flat()
      )
    );

    // Constant attributes for BufferTransform
    const sourcePositions64Low = new Float32Array([0, 0, 0]);
    const targetPositions64Low = new Float32Array([0, 0, 0]);
    const widths = new Float32Array([width]);

    const transform = new BufferTransform(this.context.device, {
      attributes: {
        sourcePosition: sourcePositions,
      },
      bufferLayout: [
        {
          name: "sourcePosition",
          format: "float32x3",
        },
      ],
      feedbackBuffers: {
        targetPosition: targetPositions,
      },
      vs: shader,
      varyings: ["targetPosition"],
      modules: [bitmapUniforms],
      vertexCount: numParticles,
    });

    this.setState({
      initialized: true,
      numInstances,
      numAgedInstances,
      sourcePositions,
      targetPositions,
      sourcePositions64Low,
      targetPositions64Low,
      colors,
      widths,
      transform,
      texture: image as Texture,
      textureNext: texNext,
      previousViewportZoom: 0,
      previousFrame: -1,
      stepRequested: false,
    });
  }

  _runTransformFeedback() {
    const { initialized } = this.state;
    if (!initialized) {
      return;
    }

    const { viewport, timeline } = this.context;
    const { imageUnscale, bounds, numParticles, speedFactor, maxAge, blend } =
      this.props;
    const {
      previousFrame,
      previousViewportZoom,
      transform,
      sourcePositions,
      targetPositions,
      numAgedInstances,
      texture,
      textureNext,
    } = this.state;

    const frame = Math.floor(timeline.getTime() / (1000 / FPS));
    if (frame === previousFrame) return;

    // Viewport
    const viewportBounds = getViewportBounds(viewport);
    const viewportZoomChangeFactor =
      2 ** ((previousViewportZoom - viewport.zoom) * 4);

    // Speed factor for zoom level
    const currentSpeedFactor = speedFactor / 2 ** (viewport.zoom + 7);

    // Prep and run the transform.
    // The uninitialised "youngest" will be created.
    // Everything else will move as appropriate.
    const moduleUniforms: UniformProps = {
      bitmapTexture: texture,
      bitmapTextureNext: textureNext ?? texture,
      blend: typeof blend === "number" ? blend : 0,
      viewportBounds: viewportBounds || [0, 0, 0, 0],
      viewportZoomChangeFactor: viewportZoomChangeFactor || 0,
      imageUnscale: imageUnscale || [0, 0],
      bounds,
      numParticles,
      maxAge,
      speedFactor: currentSpeedFactor,
      time: timeline.getTime(),
      seed: Math.random(),
    };
    transform.model.shaderInputs.setProps({ bitmap: moduleUniforms });
    transform.run({
      clearColor: false,
      clearDepth: false,
      clearStencil: false,
      depthReadOnly: true,
      stencilReadOnly: true,
    });

    // As discussed in _setupTransformFeedback()
    // We copy the buffer across, but shift everything down 'one age'.
    // Oldest has dsisappeared, the blank at the start is the youngest.
    const encoder = this.context.device.createCommandEncoder();
    encoder.copyBufferToBuffer({
      sourceBuffer: sourcePositions,
      sourceOffset: 0,
      destinationBuffer: targetPositions,
      destinationOffset: numParticles * 4 * 3,
      size: numAgedInstances * 4 * 3,
    });
    encoder.finish();
    encoder.destroy();

    // Swap the buffers.
    this.state.sourcePositions = targetPositions;
    this.state.targetPositions = sourcePositions;
    transform.model.setAttributes({
      sourcePosition: targetPositions,
    });
    transform.transformFeedback.setBuffers({
      targetPosition: sourcePositions,
    });

    this.state.previousViewportZoom = viewport.zoom;
    this.state.previousFrame = frame;
  }

  _resetTransformFeedback() {
    const { initialized } = this.state;
    if (!initialized) {
      return;
    }

    const { sourcePositions, targetPositions, numInstances } = this.state;
    sourcePositions.write(new Float32Array(numInstances * 3));
    targetPositions.write(new Float32Array(numInstances * 3));
  }

  _deleteTransformFeedback() {
    const { initialized } = this.state;
    if (!initialized) {
      return;
    }

    const { sourcePositions, targetPositions, colors, transform } = this.state;
    sourcePositions.destroy();
    targetPositions.destroy();
    colors.destroy();
    transform.destroy();

    this.setState({
      initialized: false,
      sourcePositions: undefined,
      targetPositions: undefined,
      colors: undefined,
      transform: undefined,
    });
  }

  // If it's animated we repeat the BufferTransform process.
  requestStep() {
    const { stepRequested } = this.state;
    if (stepRequested) {
      return;
    }

    this.state.stepRequested = true;
    setTimeout(() => {
      this.step();
      this.state.stepRequested = false;
    }, 1000 / FPS);
  }

  step() {
    this._runTransformFeedback();

    this.setNeedsRedraw();
  }

  clear() {
    this._resetTransformFeedback();

    this.setNeedsRedraw();
  }
}

ParticleLayer.layerName = "ParticleLayer";
ParticleLayer.defaultProps = defaultProps;

// Viewport Functions
export function getViewportBounds(viewport) {
  return wrapBounds(viewport.getBounds());
}

/**
 * Modulo rather than remainder.
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Remainder#description
 */
function modulo(x: number, y: number): number {
  return ((x % y) + y) % y;
}

export function wrapLongitude(
  lng: number,
  minLng: number | undefined = undefined
): number {
  let wrappedLng = modulo(lng + 180, 360) - 180;
  if (typeof minLng === "number" && wrappedLng < minLng) {
    wrappedLng += 360;
  }
  return wrappedLng;
}

export function wrapBounds(bounds: GeoJSON.BBox): GeoJSON.BBox {
  // Wrap Longitude
  const minLng = bounds[2] - bounds[0] < 360 ? wrapLongitude(bounds[0]) : -180;
  const maxLng =
    bounds[2] - bounds[0] < 360 ? wrapLongitude(bounds[2], minLng) : 180;

  // Clip Latitude
  const minLat = Math.max(bounds[1], -90);
  const maxLat = Math.min(bounds[3], 90);

  return [minLng, minLat, maxLng, maxLat] as GeoJSON.BBox;
}
