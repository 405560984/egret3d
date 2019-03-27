namespace egret3d.webgl {
    const _browserPrefixes = [
        "",
        "MOZ_",
        "OP_",
        "WEBKIT_",
    ];

    function _getExtension(webgl: WebGLRenderingContext, name: string) {
        for (const prefixedName of _browserPrefixes) {
            const extension = webgl.getExtension(prefixedName + name);
            if (extension) {
                return extension;
            }
        }

        return null;
    }

    function _getMaxShaderPrecision(webgl: WebGLRenderingContext, precision: "lowp" | "mediump" | "highp") {
        if (precision === "highp") {
            if (
                webgl.getShaderPrecisionFormat(webgl.VERTEX_SHADER, webgl.HIGH_FLOAT)!.precision > 0 &&
                webgl.getShaderPrecisionFormat(webgl.FRAGMENT_SHADER, webgl.HIGH_FLOAT)!.precision > 0
            ) {
                return "highp";
            }

            precision = "mediump";
        }

        if (precision === "mediump") {
            if (
                webgl.getShaderPrecisionFormat(webgl.VERTEX_SHADER, webgl.MEDIUM_FLOAT)!.precision > 0 &&
                webgl.getShaderPrecisionFormat(webgl.FRAGMENT_SHADER, webgl.MEDIUM_FLOAT)!.precision > 0
            ) {
                return "mediump";
            }
        }

        return "lowp";
    }
    /**
     * @internal
     */
    export function setTexturexParameters(type: gltf.TextureType, sampler: gltf.Sampler, anisotropy: number) {
        const webgl = WebGLRenderState.webgl!;

        webgl.texParameteri(type, gltf.WebGL.TEXTURE_MAG_FILTER, sampler.magFilter!);
        webgl.texParameteri(type, gltf.WebGL.TEXTURE_MIN_FILTER, sampler.minFilter!);
        webgl.texParameteri(type, gltf.WebGL.TEXTURE_WRAP_S, sampler.wrapS!);
        webgl.texParameteri(type, gltf.WebGL.TEXTURE_WRAP_T, sampler.wrapT!);

        if (renderState.textureFilterAnisotropic && anisotropy > 1) {
            webgl.texParameterf(type, renderState.textureFilterAnisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(anisotropy, renderState.maxAnisotropy));
        }
    }
    /**
     * @internal
     */
    export class WebGLRenderState extends RenderState {
        /**
         * @deprecated
         */
        public static canvas: HTMLCanvasElement | null = null;
        /**
         * @deprecated
         */
        public static webgl: WebGLRenderingContext | null = null;

        protected _setViewport(value: Readonly<Rectangle>) {
            const renderTarget = this._renderTarget;
            let w: number;
            let h: number;
            if (renderTarget) {
                w = renderTarget.width;
                h = renderTarget.height;
            }
            else {
                const stageViewport = stage.viewport;
                w = stageViewport.w;
                h = stageViewport.h;
            }

            const webgl = WebGLRenderState.webgl!;
            webgl.viewport(w * value.x, h * (1.0 - value.y - value.h), w * value.w, h * value.h);
        }
        protected _setRenderTarget(value: RenderTexture | null) {
            if (value) {
                value.activateTexture();
            }
            else {
                const webgl = WebGLRenderState.webgl!;
                webgl.bindFramebuffer(gltf.WebGL.FrameBuffer, null);
            }
        }
        protected _setColorMask(value: Readonly<[boolean, boolean, boolean, boolean]>) {
            const webgl = WebGLRenderState.webgl!;
            webgl.colorMask(value[0], value[1], value[2], value[3]);
        }

        public initialize() {
            super.initialize();

            const options = paper.Application.options;
            WebGLRenderState.canvas = options.canvas!;
            WebGLRenderState.webgl = options.webgl!;

            const webgl = WebGLRenderState.webgl;
            if (!webgl) {
                return;
            }

            const webglVersions = /^WebGL\ ([0-9])/.exec(webgl.getParameter(webgl.VERSION));
            this.version = webglVersions ? parseFloat(webglVersions[1]).toString() : "1";
            // use dfdx and dfdy must enable OES_standard_derivatives
            this.standardDerivativesEnabled = !!_getExtension(webgl, "OES_standard_derivatives");
            this.textureFloatEnabled = !!_getExtension(webgl, "OES_texture_float");
            this.fragDepthEnabled = !!_getExtension(webgl, "EXT_frag_depth");
            this.textureFilterAnisotropic = _getExtension(webgl, "EXT_texture_filter_anisotropic");
            this.shaderTextureLOD = _getExtension(webgl, "EXT_shader_texture_lod");
            //
            this.maxPrecision = _getMaxShaderPrecision(webgl, "highp");
            this.maxTextures = webgl.getParameter(webgl.MAX_TEXTURE_IMAGE_UNITS);
            this.maxVertexTextures = webgl.getParameter(webgl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
            this.maxTextureSize = webgl.getParameter(webgl.MAX_TEXTURE_SIZE);
            this.maxCubemapSize = webgl.getParameter(webgl.MAX_CUBE_MAP_TEXTURE_SIZE);
            this.maxRenderBufferize = webgl.getParameter(webgl.MAX_RENDERBUFFER_SIZE);
            this.maxVertexUniformVectors = webgl.getParameter(webgl.MAX_VERTEX_UNIFORM_VECTORS);
            this.maxBoneCount = this.textureFloatEnabled ? 1024 : Math.floor((this.maxVertexUniformVectors - 20) / 4);
            this.maxAnisotropy = (this.textureFilterAnisotropic !== null) ? webgl.getParameter(this.textureFilterAnisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 0;
            //
            this._getCommonExtensions();
            this._getCommonDefines();
            //
            console.info("WebGL version:", this.version);
            console.info("Standard derivatives enabled:", this.standardDerivativesEnabled);
            console.info("Texture float enabled:", this.textureFloatEnabled);
            console.info("Frag depth enabled:", this.fragDepthEnabled);
            console.info("Texture filter anisotropic:", this.textureFilterAnisotropic);
            console.info("Shader texture LOD:", this.shaderTextureLOD);
            //
            console.info("Maximum shader precision:", this.maxPrecision);
            console.info("Maximum texture count:", this.maxTextures);
            console.info("Maximum vertex texture count:", this.maxVertexTextures);
            console.info("Maximum texture size:", this.maxTextureSize);
            console.info("Maximum cube map texture size:", this.maxCubemapSize);
            console.info("Maximum render buffer size:", this.maxRenderBufferize);
            console.info("Maximum vertex uniform vectors:", this.maxVertexUniformVectors);
            console.info("Maximum GPU skinned bone count:", this.maxBoneCount);
            console.info("Maximum anisotropy:", this.maxAnisotropy);
        }

        public clearBuffer(bufferBit: gltf.BufferMask) {
            const webgl = WebGLRenderState.webgl!;

            if (bufferBit & gltf.BufferMask.Depth) {
                webgl.depthMask(true);//TODO
                webgl.clearDepth(this._clearDepth);//TODO 2d,3d渲染状态统一后，放到每个调用函数中，可以做缓存
            }

            if (bufferBit & gltf.BufferMask.Stencil) {
                webgl.clearStencil(this._clearStencil);//TODO
            }

            if (bufferBit & gltf.BufferMask.Color) {
                const clearColor = this._clearColor;
                clearColor && webgl.clearColor(clearColor.r, clearColor.g, clearColor.b, clearColor.a);//TODO
            }

            webgl.clear(bufferBit);
        }

        public copyFramebufferToTexture(screenPostion: Vector2, target: BaseTexture, level: number = 0) {
            const webgl = WebGLRenderState.webgl!;
            target.bindTexture(0);
            webgl.copyTexImage2D(target.type, level, target.format, screenPostion.x, screenPostion.y, target.width, target.height, 0); //TODO
        }

        public updateState(state: gltf.States | null) {
            const webgl = WebGLRenderState.webgl!;
            const stateEnables = this._stateEnables;
            const cacheStateEnable = this._cacheStateEnable;
            //
            for (const e of stateEnables) {
                const b = state ? state.enable && state.enable.indexOf(e) >= 0 : false;
                if (cacheStateEnable[e] !== b) {
                    cacheStateEnable[e] = b;
                    b ? webgl.enable(e) : webgl.disable(e);
                }
            }
            // Functions.
            if (state) {
                const functions = state.functions;
                if (functions) {
                    for (const k in functions) {
                        ((webgl as any)[k] as Function).apply(webgl, functions[k]);
                    }
                }
            }
        }
    }
    // Retargeting.
    egret3d.RenderState = WebGLRenderState;
}