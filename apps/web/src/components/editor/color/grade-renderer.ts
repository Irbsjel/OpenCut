import {
	CURVE_LUT_SIZE,
	applyGradeToImageData,
	buildCurveLut,
	gradeToUniforms,
	type GradeState,
} from "./grade-math";

export type GradeSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.0,1.0); }`;

// Zelfde keten als applyGrade() in grade-math.ts.
const FRAG = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform sampler2D curves;
uniform float exposure;
uniform vec3 wb;
uniform vec3 lift;
uniform vec3 gammaExp;
uniform vec3 gain;
uniform float contrast;
uniform float saturation;
void main(){
  vec3 c = texture2D(tex, uv).rgb * exposure * wb;
  c = c * gain + lift * (1.0 - c);
  c = pow(max(c, vec3(0.0)), gammaExp);
  c = (c - 0.5) * contrast + 0.5;
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(vec3(y) + (c - vec3(y)) * saturation, 0.0, 1.0);
  float half_ = 0.5 / ${CURVE_LUT_SIZE}.0;
  float scale = (${CURVE_LUT_SIZE}.0 - 1.0) / ${CURVE_LUT_SIZE}.0;
  vec3 o = vec3(
    texture2D(curves, vec2(c.r * scale + half_, 0.5)).r,
    texture2D(curves, vec2(c.g * scale + half_, 0.5)).g,
    texture2D(curves, vec2(c.b * scale + half_, 0.5)).b);
  gl_FragColor = vec4(o, 1.0);
}`;

/**
 * Tekent een bron met de kleurcorrectie op een canvas. Gebruikt WebGL; zonder
 * WebGL valt het terug op de CPU-referentie (trager maar identiek resultaat).
 */
export class GradeRenderer {
	readonly canvas: HTMLCanvasElement;
	readonly mode: "webgl" | "cpu";
	private gl: WebGLRenderingContext | null = null;
	private program: WebGLProgram | null = null;
	private texture: WebGLTexture | null = null;
	private curveTexture: WebGLTexture | null = null;
	private cpu: CanvasRenderingContext2D | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: false });
		if (gl && this.init(gl)) {
			this.gl = gl;
			this.mode = "webgl";
		} else {
			this.cpu = canvas.getContext("2d", { willReadFrequently: true });
			this.mode = "cpu";
		}
	}

	private init(gl: WebGLRenderingContext): boolean {
		const compile = (type: number, src: string) => {
			const shader = gl.createShader(type);
			if (!shader) return null;
			gl.shaderSource(shader, src);
			gl.compileShader(shader);
			return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
		};
		const vs = compile(gl.VERTEX_SHADER, VERT);
		const fs = compile(gl.FRAGMENT_SHADER, FRAG);
		if (!vs || !fs) return false;
		const program = gl.createProgram();
		if (!program) return false;
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
		gl.useProgram(program);
		const buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		const loc = gl.getAttribLocation(program, "p");
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
		const makeTexture = (unit: number) => {
			const tex = gl.createTexture();
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			return tex;
		};
		this.texture = makeTexture(0);
		this.curveTexture = makeTexture(1);
		gl.uniform1i(gl.getUniformLocation(program, "tex"), 0);
		gl.uniform1i(gl.getUniformLocation(program, "curves"), 1);
		this.program = program;
		return true;
	}

	/** Teken `source` (breedte/hoogte uit de bron, begrensd op maxWidth) met `grade`. */
	render(source: GradeSource, grade: GradeState, size: { width: number; height: number }) {
		const { canvas } = this;
		if (canvas.width !== size.width) canvas.width = size.width;
		if (canvas.height !== size.height) canvas.height = size.height;
		const gl = this.gl;
		if (gl && this.program) {
			gl.viewport(0, 0, size.width, size.height);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, this.texture);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
			gl.texImage2D(
				gl.TEXTURE_2D, 0, gl.RGBA, CURVE_LUT_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
				buildCurveLut(grade),
			);
			const u = gradeToUniforms(grade);
			const loc = (name: string) => gl.getUniformLocation(this.program as WebGLProgram, name);
			gl.uniform1f(loc("exposure"), u.exposure);
			gl.uniform3fv(loc("wb"), u.wb);
			gl.uniform3fv(loc("lift"), u.lift);
			gl.uniform3fv(loc("gammaExp"), u.gammaExp);
			gl.uniform3fv(loc("gain"), u.gain);
			gl.uniform1f(loc("contrast"), u.contrast);
			gl.uniform1f(loc("saturation"), u.saturation);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			return;
		}
		const ctx = this.cpu;
		if (!ctx) return;
		ctx.drawImage(source, 0, 0, size.width, size.height);
		const frame = ctx.getImageData(0, 0, size.width, size.height);
		applyGradeToImageData(frame.data, grade);
		ctx.putImageData(frame, 0, 0);
	}
}
