namespace egret3d.webgl {
    const _patternInclude = /^[ \t]*#include +<([\w\d./]+)>/gm;
    const _patternLoop = /#pragma unroll_loop[\s]+?for \( int i \= (\d+)\; i < (\d+)\; i \+\+ \) \{([\s\S]+?)(?=\})\}/g;

    function _replace(match: string, include: string): string {
        let flag = true;
        let chunk = "";

        if (include in ShaderChunk) {
            chunk = (ShaderChunk as any)[include];
        }
        else if (include in renderState.defaultCustomShaderChunks) {
            flag = false;
            chunk = renderState.customShaderChunks ? renderState.customShaderChunks[include] || "" : "";
        }

        if (chunk) {
            return chunk.replace(_patternInclude, _replace);
        }

        if (flag) {
            console.error(`Can not resolve #include <${include}>`);
        }

        return "";
    }

    function _loopReplace(match: string, start: string, end: string, snippet: string) {
        let unroll = "";
        for (var i = parseInt(start); i < parseInt(end); i++) {
            unroll += snippet.replace(/ i /g, " " + i + " ");
        }

        return unroll;
    }

    function _parseIncludes(string: string): string {
        return string.replace(_patternInclude, _replace);
    }

    function _replaceShaderNums(string: string) {
        const { directionalLights, spotLights, rectangleAreaLights, pointLights, hemisphereLights } = cameraAndLightCollecter;

        return string
            .replace(new RegExp(ShaderDefine.NUM_DIR_LIGHTS, "g"), directionalLights.length.toString())
            .replace(new RegExp(ShaderDefine.NUM_SPOT_LIGHTS, "g"), spotLights.length.toString())
            .replace(new RegExp(ShaderDefine.NUM_RECT_AREA_LIGHTS, "g"), rectangleAreaLights.length.toString())
            .replace(new RegExp(ShaderDefine.NUM_POINT_LIGHTS, "g"), pointLights.length.toString())
            .replace(new RegExp(ShaderDefine.NUM_HEMI_LIGHTS, "g"), hemisphereLights.length.toString())
            .replace(new RegExp(ShaderDefine.NUM_CLIPPING_PLANES, "g"), "0")
            .replace(new RegExp(ShaderDefine.UNION_CLIPPING_PLANES, "g"), "0")
            ;
    }

    function _unrollLoops(string: string) {
        return string.replace(_patternLoop, _loopReplace);
    }
    /**
     * @internal
     */
    export class WebGLRenderSystem extends paper.BaseSystem<paper.GameObject> implements IRenderSystem {
        private readonly _drawCallCollecter: DrawCallCollecter = paper.Application.sceneManager.globalEntity.getComponent(DrawCallCollecter)!;
        private readonly _cameraAndLightCollecter: CameraAndLightCollecter = paper.Application.sceneManager.globalEntity.getComponent(CameraAndLightCollecter)!;
        private readonly _renderState: WebGLRenderState = paper.Application.sceneManager.globalEntity.getComponent(RenderState) as WebGLRenderState;
        //
        private readonly _modelViewPojectionMatrix: Matrix4 = Matrix4.create();
        private readonly _inverseModelViewMatrix: Matrix3 = Matrix3.create();
        //
        private _cacheCurrentCamera: Camera | null = null;
        //
        private _cacheProgram: WebGLProgramBinder | null = null;
        private _cacheScene: paper.Scene | null = null;
        private _cacheCamera: Camera | null = null;
        //
        private _cacheLight: BaseLight | null = null;
        //
        private _cacheMesh: Mesh | null = null;
        private _cacheSubMeshIndex: int = -1;
        //
        private _cacheMaterial: Material | null = null;
        private _cacheMaterialVersion: int = -1;
        //
        private _cacheLightmapIndex: int = -1;

        private _compileShader(shader: gltf.Shader, defines: string) {
            const webgl = WebGLRenderState.webgl!;
            const webGLShader = webgl.createShader(shader.type)!;
            let shaderContent = _parseIncludes(shader.uri!);
            shaderContent = _replaceShaderNums(shaderContent);
            shaderContent = defines + _unrollLoops(shaderContent);
            webgl.shaderSource(webGLShader, shaderContent);
            webgl.compileShader(webGLShader);

            const parameter = webgl.getShaderParameter(webGLShader, gltf.WebGL.CompileStatus);

            if (parameter) {
                return webGLShader;
            }

            console.error("Compile webgl shader error.", shader.name, "\n", webgl.getShaderInfoLog(webGLShader));
            webgl.deleteShader(webGLShader);

            return null;
        }

        private _updateProgram(scene: paper.Scene, renderer: paper.BaseRenderer | null, material: Material) {
            const webgl = WebGLRenderState.webgl!;
            const renderState = this._renderState;
            const shader = material.shader as WebGLShader;
            const programs = shader.programs;

            let forceUpdate = false;
            let program: WebGLProgramBinder | null = null;

            const programKey = renderState._updateDrawDefines(renderer).definesMask +
                material.defines.definesMask +
                scene.defines.definesMask;

            if (programKey in programs) {
                program = programs[programKey];
            }
            else {
                const extensions = shader.config.extensions!.KHR_techniques_webgl;
                const defines = [
                    renderState.defines,
                    scene.defines,
                    material.defines,
                ];
                renderState.customShaderChunks = shader.customs;
                //
                const vertexWebGLShader = this._compileShader(extensions!.shaders[0], renderState.getPrefixVertex(Defines.link(defines, DefineLocation.Vertex)))!; // TODO 顺序依赖
                const fragmentWebGLShader = this._compileShader(extensions!.shaders[1], renderState.getPrefixFragment(Defines.link(defines, DefineLocation.Fragment)))!;  // TODO 顺序依赖

                if (vertexWebGLShader !== null && fragmentWebGLShader !== null) {
                    const webGLProgram = webgl.createProgram()!;
                    webgl.attachShader(webGLProgram, vertexWebGLShader);
                    webgl.attachShader(webGLProgram, fragmentWebGLShader);
                    // TODO bindAttribLocation
                    webgl.linkProgram(webGLProgram);

                    const programLog = webgl.getProgramInfoLog(webGLProgram)!.trim();
                    const vertexLog = webgl.getShaderInfoLog(vertexWebGLShader)!.trim();
                    const fragmentLog = webgl.getShaderInfoLog(fragmentWebGLShader)!.trim();
                    const parameter = webgl.getProgramParameter(webGLProgram, gltf.WebGL.LinkStatus);

                    if (parameter) {
                        program = new WebGLProgramBinder(webGLProgram).extract(material.technique);
                    }
                    else {
                        console.error("Create webgl program error.", shader.name, programLog, vertexLog, fragmentLog);
                        webgl.deleteProgram(webGLProgram);
                    }

                    webgl.deleteShader(vertexWebGLShader);
                    webgl.deleteShader(fragmentWebGLShader);
                }

                programs[programKey] = program;
            }
            //
            if (program !== this._cacheProgram) {
                if (program !== null) {
                    webgl.useProgram(program.program);
                }

                this._cacheProgram = program;

                this._cacheScene = null;
                this._cacheCamera = null;
                this._cacheLight = null;

                this._cacheSubMeshIndex = -1;
                this._cacheMesh = null;

                this._cacheMaterialVersion = -1;
                this._cacheMaterial = null;

                this._cacheLightmapIndex = -1;
                forceUpdate = true;
            }

            return forceUpdate;
        }

        private _updateAttributes(mesh: Mesh, subMeshIndex: uint) {
            const webgl = WebGLRenderState.webgl!;
            const renderState = this._renderState;
            const { primitives, extras } = mesh.glTFMesh;
            const primitiveExtras = primitives[subMeshIndex].extras!;

            mesh.update(MeshNeedUpdate.VertexArray | MeshNeedUpdate.VertexBuffer | MeshNeedUpdate.IndexBuffer, subMeshIndex);

            if (renderState.vertexArrayObject !== null) {
                webgl.bindVertexArray(primitiveExtras.vao);
            }
            else {
                const vbo = extras!.vbo;
                const ibo = primitiveExtras.ibo;

                webgl.bindBuffer(gltf.BufferViewTarget.ArrayBuffer, vbo);
                webgl.bindBuffer(gltf.BufferViewTarget.ElementArrayBuffer, ibo);
                renderState.updateVertexAttributes(mesh, subMeshIndex);
            }
        }

        private _updateGlobalUniforms(program: WebGLProgramBinder, camera: Camera, drawCall: DrawCall, renderer: paper.BaseRenderer | null, currentScene: paper.Scene | null, forceUpdate: boolean) {
            const webgl = WebGLRenderState.webgl!;
            const cameraAndLightCollecter = this._cameraAndLightCollecter;
            const renderState = this._renderState;
            const globalUniforms = program.globalUniforms;
            const modelUniforms = program.modelUniforms;
            const context = camera.context;
            const matrix = drawCall.matrix;
            const modelViewMatrix = drawCall.modelViewMatrix;
            let i = 0;
            //
            this._modelViewPojectionMatrix.multiply(camera.worldToClipMatrix, matrix);
            // Global.
            if (forceUpdate) {
                const activeScene = paper.Application.sceneManager.activeScene;
                const fog = activeScene.fog;
                i = globalUniforms.length;

                while (i--) {
                    const { semantic, location } = globalUniforms[i];

                    switch (semantic!) {
                        case gltf.UniformSemantics._TONE_MAPPING_EXPOSURE:
                            webgl.uniform1f(location, renderState.toneMappingExposure);
                            break;

                        case gltf.UniformSemantics._TONE_MAPPING_WHITE_POINT:
                            webgl.uniform1f(location, renderState.toneMappingWhitePoint);
                            break;

                        case gltf.UniformSemantics._AMBIENTLIGHTCOLOR:
                            const currenAmbientColor = activeScene.ambientColor;
                            webgl.uniform3f(location, currenAmbientColor.r, currenAmbientColor.g, currenAmbientColor.b);
                            break;

                        case gltf.UniformSemantics._FOG_NEAR:
                            webgl.uniform1f(location, fog.near);
                            break;

                        case gltf.UniformSemantics._FOG_FAR:
                            webgl.uniform1f(location, fog.far);
                            break;

                        case gltf.UniformSemantics._FOG_DENSITY:
                            webgl.uniform1f(location, fog.density);
                            break;

                        case gltf.UniformSemantics._FOG_COLOR:
                            const fogColor = fog.color;
                            webgl.uniform3f(location, fogColor.r, fogColor.g, fogColor.b);
                            break;

                        case gltf.UniformSemantics._RESOLUTION:
                            webgl.uniform2f(location, 1.0 / stage.viewport.w, 1.0 / stage.viewport.h);
                            break;
                    }
                }
            }
            // Scene.
            if (currentScene !== this._cacheScene) {
                if (currentScene) {
                    const sceneUniforms = program.sceneUniforms;
                    i = sceneUniforms.length;

                    while (i--) {
                        const { semantic, location } = sceneUniforms[i];

                        switch (semantic!) {
                            case gltf.UniformSemantics._LIGHTMAPINTENSITY:
                                webgl.uniform1f(location, currentScene.lightmapIntensity);
                                break;
                        }
                    }
                }

                this._cacheScene = currentScene;
            }
            // Camera.
            if (camera !== this._cacheCamera) {
                const cameraUniforms = program.cameraUniforms;
                const rawData = camera.cameraToWorldMatrix.rawData;
                i = cameraUniforms.length;

                while (i--) {
                    const { semantic, location } = cameraUniforms[i];

                    switch (semantic!) {
                        case gltf.UniformSemantics.VIEW:
                            webgl.uniformMatrix4fv(location, false, camera.worldToCameraMatrix.rawData);
                            break;

                        case gltf.UniformSemantics.PROJECTION:
                            webgl.uniformMatrix4fv(location, false, camera.projectionMatrix.rawData);
                            break;

                        case gltf.UniformSemantics._VIEWPROJECTION:
                            webgl.uniformMatrix4fv(location, false, camera.worldToClipMatrix.rawData);
                            break;

                        case gltf.UniformSemantics._CAMERA_FORWARD:
                            webgl.uniform3f(location, -rawData[8], -rawData[9], -rawData[10]);
                            break;

                        case gltf.UniformSemantics._CAMERA_UP:
                            webgl.uniform3f(location, rawData[4], rawData[5], rawData[6]);
                            break;

                        case gltf.UniformSemantics._CAMERA_POS:
                            webgl.uniform3f(location, rawData[12], rawData[13], rawData[14]);
                            break;

                        case gltf.UniformSemantics._DIRECTLIGHTS:
                            if (context.directLightBuffer.byteLength > 0) {
                                webgl.uniform1fv(location, context.directLightBuffer);
                            }
                            break;

                        case gltf.UniformSemantics._SPOTLIGHTS:
                            if (context.spotLightBuffer.byteLength > 0) {
                                webgl.uniform1fv(location, context.spotLightBuffer);
                            }
                            break;

                        case gltf.UniformSemantics._RECTAREALIGHTS:
                            if (context.pointLightBuffer.length > 0) {
                                webgl.uniform1fv(location, context.rectangleAreaLightBuffer);
                            }
                            break;

                        case gltf.UniformSemantics._POINTLIGHTS:
                            if (context.pointLightBuffer.length > 0) {
                                webgl.uniform1fv(location, context.pointLightBuffer);
                            }
                            break;

                        case gltf.UniformSemantics._HEMILIGHTS:
                            if (context.hemisphereLightBuffer.byteLength > 0) {
                                webgl.uniform1fv(location, context.hemisphereLightBuffer);
                            }
                            break;

                        case gltf.UniformSemantics._LOG_DEPTH_BUFFC:
                            webgl.uniform1f(location, context.logDepthBufFC);
                            break;
                    }
                }

                this._cacheCamera = camera;
            }
            // TODO
            if (cameraAndLightCollecter.currentShadowLight && this._cacheLight !== cameraAndLightCollecter.currentShadowLight) {
                const shadowUniforms = program.shadowUniforms;
                const light = this._cacheLight = cameraAndLightCollecter.currentShadowLight;
                i = shadowUniforms.length;

                while (i--) {
                    const { semantic, location } = shadowUniforms[i];

                    switch (semantic!) {
                        case gltf.UniformSemantics._REFERENCEPOSITION:
                            const rawData = light.transform.localToWorldMatrix.rawData;
                            webgl.uniform3f(location, rawData[12], rawData[13], rawData[14]);
                            break;

                        case gltf.UniformSemantics._NEARDICTANCE:
                            webgl.uniform1f(location, light.shadow.near);
                            break;

                        case gltf.UniformSemantics._FARDISTANCE:
                            webgl.uniform1f(location, light.shadow.far);
                            break;
                    }
                }
            }
            // Model.
            i = modelUniforms.length;
            while (i--) {
                const uniform = modelUniforms[i];
                const { semantic, location } = uniform;

                switch (semantic) {
                    case gltf.UniformSemantics.MODEL:
                        webgl.uniformMatrix4fv(location, false, matrix.rawData);
                        break;

                    case gltf.UniformSemantics.MODELVIEW:
                        webgl.uniformMatrix4fv(location, false, modelViewMatrix.rawData);
                        break;

                    case gltf.UniformSemantics.MODELVIEWPROJECTION:
                        webgl.uniformMatrix4fv(location, false, this._modelViewPojectionMatrix.rawData);
                        break;

                    case gltf.UniformSemantics.MODELVIEWINVERSE:
                        webgl.uniformMatrix3fv(location, false, this._inverseModelViewMatrix.getNormalMatrix(modelViewMatrix).rawData);
                        break;

                    case gltf.UniformSemantics.JOINTMATRIX:
                        const skinnedMeshRenderer = (renderer as SkinnedMeshRenderer).source || (renderer as SkinnedMeshRenderer);
                        webgl.uniformMatrix4fv(location, false, skinnedMeshRenderer.boneMatrices!);
                        break;

                    case gltf.UniformSemantics._BONETEXTURE:
                        if (uniform.textureUnits && uniform.textureUnits.length === 1) {
                            const skinnedMeshRenderer = (renderer as SkinnedMeshRenderer).source || (renderer as SkinnedMeshRenderer);
                            const texture = skinnedMeshRenderer.boneTexture!; //TODO可能有空
                            const unit = uniform.textureUnits[0];
                            webgl.uniform1i(location, unit);
                            texture.bindTexture(unit);
                        }
                        else {
                            console.error("Error texture unit.");
                        }
                        break;

                    case gltf.UniformSemantics._BONETEXTURESIZE:
                        {
                            const skinnedMeshRenderer = (renderer as SkinnedMeshRenderer).source || (renderer as SkinnedMeshRenderer);
                            webgl.uniform1i(location, skinnedMeshRenderer.boneTexture!.width);
                            break;
                        }

                    case gltf.UniformSemantics._CLOCK:
                        webgl.uniform4fv(location, renderState.caches.clockBuffer);
                        break;
                    case gltf.UniformSemantics._ROTATION:
                        webgl.uniform1f(location, renderer!.transform.euler.z);
                        break;

                    case gltf.UniformSemantics._SCALE2D:
                        const scale = renderer!.transform.scale;
                        webgl.uniform2f(location, scale.x, scale.y);
                        break;

                    case gltf.UniformSemantics._DIRECTIONSHADOWMAT:
                        webgl.uniformMatrix4fv(location, false, context.directShadowMatrix);
                        break;
                    case gltf.UniformSemantics._SPOTSHADOWMAT:
                        webgl.uniformMatrix4fv(location, false, context.spotShadowMatrix);
                        break;
                    case gltf.UniformSemantics._POINTSHADOWMAT:
                        webgl.uniformMatrix4fv(location, false, context.pointShadowMatrix);
                        break;

                    case gltf.UniformSemantics._DIRECTIONSHADOWMAP:
                        const directShadowLen = context.directShadowMaps.length;
                        if (directShadowLen > 0 && uniform.textureUnits) {
                            const units = uniform.textureUnits;
                            webgl.uniform1iv(location, units);

                            for (let i = 0, l = units.length; i < l; i++) {
                                const directShadowMap = context.directShadowMaps[i] || DefaultTextures.WHITE;//对应灯光可能不产生投影，但是阴影贴图数量是全局值，这里使用默认贴图防止报错
                                const unit = units[i];
                                const texture = directShadowMap as WebGLTexture;
                                texture.bindTexture(unit);
                            }
                        }
                        break;

                    case gltf.UniformSemantics._POINTSHADOWMAP:
                        const pointShadowLen = context.pointShadowMaps.length;
                        if (pointShadowLen > 0 && uniform.textureUnits) {
                            const units = uniform.textureUnits;
                            webgl.uniform1iv(location, units);

                            for (let i = 0, l = units.length; i < l; i++) {
                                const pointShadowMap = context.pointShadowMaps[i] || DefaultTextures.WHITE;
                                const unit = units[i];
                                const texture = pointShadowMap as WebGLTexture;
                                texture.bindTexture(unit);
                            }
                        }
                        break;

                    case gltf.UniformSemantics._SPOTSHADOWMAP:
                        const spotShadowLen = context.spotShadowMaps.length;
                        if (spotShadowLen > 0 && uniform.textureUnits) {
                            const units = uniform.textureUnits;
                            webgl.uniform1iv(location, units);

                            for (let i = 0, l = units.length; i < l; i++) {
                                const spotShadowMaps = context.spotShadowMaps[i] || DefaultTextures.WHITE;
                                const unit = units[i];
                                const texture = spotShadowMaps as WebGLTexture;
                                texture.bindTexture(unit);
                            }
                        }
                        break;

                    case gltf.UniformSemantics._LIGHTMAP_SCALE_OFFSET:
                        const lightmapScaleOffset = (renderer as MeshRenderer).lightmapScaleOffset;
                        webgl.uniform4f(location, lightmapScaleOffset.x, lightmapScaleOffset.y, lightmapScaleOffset.z, lightmapScaleOffset.w);
                        break;

                    case gltf.UniformSemantics._LIGHTMAPTEX:
                        const lightmapIndex = (renderer as MeshRenderer).lightmapIndex;
                        if (lightmapIndex >= 0 && lightmapIndex !== this._cacheLightmapIndex) {
                            if (uniform.textureUnits && uniform.textureUnits.length === 1) {
                                const texture = currentScene!.lightmaps[lightmapIndex] || DefaultTextures.WHITE;//TODO可能有空
                                const unit = uniform.textureUnits[0];
                                webgl.uniform1i(location, unit);
                                texture.bindTexture(unit);
                            }
                            else {
                                console.error("Error texture unit.");
                            }

                            this._cacheLightmapIndex = lightmapIndex;
                        }
                        break;
                }
            }
        }

        private _updateUniforms(program: WebGLProgramBinder, material: Material) {
            const webgl = WebGLRenderState.webgl!;
            const technique = material.technique;
            const techniqueState = technique.states || null;
            const renderState = this._renderState;
            //
            if (material._dirty) {
                material._update();
            }
            // 
            if (technique.program !== program.id) {
                technique.program = program.id;
            }
            // Update states.
            renderState.updateState(techniqueState);
            //
            const unifroms = technique.uniforms;

            for (const programUniform of program.uniforms) { // TODO 
                const location = programUniform.location;
                const uniform = unifroms[programUniform.name];
                const value = uniform.value;

                switch (uniform.type) {
                    case gltf.UniformType.BOOL:
                    case gltf.UniformType.INT:
                        if (programUniform.size > 1) {
                            webgl.uniform1iv(location, value);
                        }
                        else {
                            webgl.uniform1i(location, value);
                        }
                        break;

                    case gltf.UniformType.FLOAT:
                        if (programUniform.size > 1) {
                            webgl.uniform1fv(location, value);
                        }
                        else {
                            webgl.uniform1f(location, value);
                        }
                        break;

                    case gltf.UniformType.BOOL_VEC2:
                    case gltf.UniformType.INT_VEC2:
                        webgl.uniform2iv(location, value);
                        break;

                    case gltf.UniformType.BOOL_VEC3:
                    case gltf.UniformType.INT_VEC3:
                        webgl.uniform3iv(location, value);
                        break;

                    case gltf.UniformType.BOOL_VEC4:
                    case gltf.UniformType.INT_VEC4:
                        webgl.uniform4iv(location, value);
                        break;

                    case gltf.UniformType.FLOAT_VEC2:
                        webgl.uniform2fv(location, value);
                        break;

                    case gltf.UniformType.FLOAT_VEC3:
                        webgl.uniform3fv(location, value);
                        break;

                    case gltf.UniformType.FLOAT_VEC4:
                        webgl.uniform4fv(location, value);
                        break;

                    case gltf.UniformType.FLOAT_MAT2:
                        webgl.uniformMatrix2fv(location, false, value);
                        break;

                    case gltf.UniformType.FLOAT_MAT3:
                        webgl.uniformMatrix3fv(location, false, value);
                        break;

                    case gltf.UniformType.FLOAT_MAT4:
                        webgl.uniformMatrix4fv(location, false, value);
                        break;

                    case gltf.UniformType.SAMPLER_2D:
                    case gltf.UniformType.SAMPLER_CUBE:
                        if (programUniform.textureUnits && programUniform.textureUnits.length === 1) {
                            const unit = programUniform.textureUnits[0];
                            let texture = value as (BaseTexture | null);
                            const isInvalide = !texture || texture.isDisposed;

                            if (programUniform.name === ShaderUniformName.EnvMap) {
                                if (isInvalide) {
                                    texture = renderState.caches.skyBoxTexture || DefaultTextures.WHITE; // TODO
                                }

                                material.setFloat(ShaderUniformName.FlipEnvMap, texture!.gltfTexture.extras!.type === gltf.TextureType.TextureCube ? 1.0 : -1.0);
                                material.setFloat(ShaderUniformName.MaxMipLevel, texture!.levels);
                            }
                            else if (isInvalide) {
                                texture = DefaultTextures.WHITE; // TODO
                            }

                            webgl.uniform1i(location, unit);
                            texture!.bindTexture(unit);
                        }
                        else {
                            console.error("Error texture unit");
                        }
                        break;
                }
            }
        }

        private _render(camera: Camera, renderTarget: RenderTexture | null, material: Material | null) {
            const renderState = this._renderState;
            renderState.renderTarget = renderTarget;
            renderState.viewport = camera.viewport;
            renderState.clearColor = camera.backgroundColor;
            renderState.clearBuffer(camera.bufferMask);
            //
            // Skybox.
            const skyBox = camera.entity.getComponent(SkyBox);
            if (skyBox && skyBox.material && skyBox.isActiveAndEnabled) {
                const skyBoxDrawCall = this._drawCallCollecter.skyBox;
                const material = skyBox.material;
                if (material.shader !== egret3d.DefaultShaders.BACKGROUND) {
                    const texture = (material.shader === egret3d.DefaultShaders.CUBE) ? material.getTexture(ShaderUniformName.CubeMap) :
                        ((material.shader === egret3d.DefaultShaders.EQUIRECT) ? material.getTexture(ShaderUniformName.EquirectMap) : material.getTexture());

                    if (renderState.caches.skyBoxTexture !== texture && skyBox.reflections) {
                        renderState._updateTextureDefines(ShaderUniformName.EnvMap, texture, renderState.defines);
                        renderState.caches.skyBoxTexture = texture;
                    }

                    // if (!skyBoxDrawCall.mesh) {
                    // DefaultMeshes.SPHERE;
                    skyBoxDrawCall.mesh = DefaultMeshes.CUBE;
                    // }
                }
                else {
                    skyBoxDrawCall.mesh = DefaultMeshes.FULLSCREEN;
                }

                skyBoxDrawCall.matrix = camera.gameObject.transform.localToWorldMatrix;

                this.draw(skyBoxDrawCall, material);
            }
            else if (renderState.caches.skyBoxTexture) {
                renderState._updateTextureDefines(ShaderUniformName.EnvMap, null, renderState.defines);
                renderState.caches.skyBoxTexture = null;
            }
            //
            const { opaqueCalls, transparentCalls } = camera.context;
            // Draw opaques.
            for (const drawCall of opaqueCalls) {
                this.draw(drawCall, material);
            }
            // Draw transparents.
            for (const drawCall of transparentCalls) {
                this.draw(drawCall, material);
            }
            //
            if (renderTarget !== null && renderTarget.levels !== 1) { // Fixed there is no texture bound to the unit 0 error.
                renderState.clearState();
            }
            // Egret 2D.
            const webgl = WebGLRenderState.webgl!;
            webgl.pixelStorei(webgl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1); // TODO 解决字体模糊。

            for (const entity of this.groups[0].entities) {
                const egret2DRenderer = entity.getComponent(Egret2DRenderer)!;

                if (camera.cullingMask & egret2DRenderer.gameObject.layer) {
                    if (egret2DRenderer._order < 0) {
                        egret2DRenderer._order = renderState.caches.egret2DOrderCount++;
                    }

                    egret2DRenderer._draw();
                    renderState.clearState();
                    this._cacheProgram = null;//防止2d的program污染3d的
                }
            }
        }

        private _renderShadow(light: BaseLight) {
            const collecter = this._cameraAndLightCollecter;
            if (collecter.currentShadowLight !== light) {
                collecter.currentShadowLight = light;

                const webgl = WebGLRenderState.webgl!;
                const renderState = this._renderState;
                const shadow = light.shadow;
                const shadowMapSize = shadow.mapSize;
                const camera = cameraAndLightCollecter.currentCamera = cameraAndLightCollecter.shadowCamera;
                const drawCalls = camera.context.shadowCalls;
                const viewport = camera.viewport;
                const isPoint = light.constructor === PointLight;
                //generate depth map
                const shadowMaterial = (isPoint) ? DefaultMaterials.SHADOW_DISTANCE : DefaultMaterials.SHADOW_DEPTH_3201;

                renderState.renderTarget = shadow._renderTarget;
                renderState.clearColor = Color.WHITE;
                renderState.clearBuffer(gltf.BufferMask.DepthAndColor);

                for (let i = 0, l = (isPoint ? 6 : 1); i < l; i++) {
                    //update shadowMatrix
                    shadow._onUpdate!(i);
                    //update draw call
                    camera._update();
                    webgl.viewport(viewport.x * shadowMapSize, viewport.y * shadowMapSize, viewport.w * shadowMapSize, viewport.h * shadowMapSize);

                    for (const drawCall of drawCalls) {
                        this.draw(drawCall, shadowMaterial);
                    }
                    //防止点光源camera因为缓存没有更新 TODO
                    this._cacheCamera = null;
                }
            }

            collecter.currentCamera = null;
            collecter.currentShadowLight = null;
        }

        protected getMatchers() {
            return [
                paper.Matcher.create<paper.GameObject>(Egret2DRenderer),
            ];
        }

        public onAwake() {
            const renderState = this._renderState;
            renderState.render = this.render.bind(this);
            renderState.draw = this.draw.bind(this);
        }

        public onFrame() {
            if (!WebGLRenderState.webgl) {
                return;
            }

            const { cameras } = this._cameraAndLightCollecter;

            if (cameras.length > 0) { // Render cameras.
                const isPlayerMode = paper.Application.playerMode === paper.PlayerMode.Player;
                const clock = paper.clock;
                const renderState = this._renderState;
                const editorScene = paper.Application.sceneManager.editorScene;

                renderState.caches.egret2DOrderCount = 0;
                renderState.caches.cullingMask = paper.Layer.Nothing;
                renderState.caches.clockBuffer[0] = clock.time; // TODO more clock info.

                // Render lights shadows. TODO 
                // if (camera.cullingMask !== renderState.caches.cullingMask) {
                const { lights } = this._cameraAndLightCollecter;

                if (lights.length > 0) {
                    for (const light of lights) {
                        if (light.castShadows && light.shadow._onUpdate) {
                            this._renderShadow(light);
                        }
                    }
                }

                //     renderState.caches.cullingMask = camera.cullingMask;
                // }

                for (const camera of cameras) {
                    const scene = camera.entity.scene;
                    const renderTarget = camera.renderTarget || camera._previewRenderTarget;
                    if (renderTarget || (isPlayerMode ? scene !== editorScene : scene === editorScene)) {
                        this.render(camera, camera.overrideMaterial, renderTarget);
                    }
                }

                this._cacheCurrentCamera = null;
                this._cacheProgram = null; //TODO
            }
            else { // Clear stage background to black.
                this._renderState.clearColor = Color.BLACK;
                this._renderState.clearBuffer(gltf.BufferMask.DepthAndColor);
            }
        }

        public onFrameCleanup() {
            this._drawCallCollecter.drawCallCount = 0;
        }

        public render(camera: Camera, material: Material | null = null, renderTarget: RenderTexture | null = null) {
            const cameraAndLightCollecter = this._cameraAndLightCollecter;
            if (cameraAndLightCollecter.currentCamera !== camera) { //如果相等，没必要在更新摄像机
                cameraAndLightCollecter.currentCamera = camera;
                camera._update();

                //TODO
                if (camera.gameObject._beforeRenderBehaviorCount > 0) {
                    let flag = false;
                    const isEditor = paper.Application.playerMode === paper.PlayerMode.Editor;

                    for (const component of camera.entity.components) {
                        if (
                            component.isActiveAndEnabled &&
                            (component.constructor as paper.IComponentClass<paper.IComponent>).isBehaviour &&
                            (!isEditor || (component.constructor as paper.IComponentClass<paper.Behaviour>).executeInEditMode) &&
                            (component as paper.Behaviour).onBeforeRender
                        ) {
                            flag = !(component as paper.Behaviour).onBeforeRender!() || flag;
                        }
                    }

                    if (flag) {
                        return;
                    }
                }
                //
                let isPostprocessing = false;
                const postprocessings = camera.entity.getComponents(CameraPostprocessing as any, true) as CameraPostprocessing[];

                if (postprocessings.length > 0) {
                    for (const postprocessing of postprocessings) {
                        if (postprocessing.isActiveAndEnabled) {
                            isPostprocessing = true;
                            break;
                        }
                    }
                }

                if (!isPostprocessing) {
                    this._cacheCurrentCamera = null;
                    this._render(camera, renderTarget, material);
                }
                else {
                    for (const postprocessing of postprocessings) {
                        if (postprocessing.isActiveAndEnabled) {
                            this._cacheCurrentCamera = camera;
                            postprocessing.onRender(camera);
                            this._cacheCurrentCamera = null;
                        }
                    }

                    camera.swapPostprocessingRenderTarget();
                }
            }
            else { // 后期渲染或 onBeforeRender 会执行此逻辑。
                this._render(camera, renderTarget, material);
            }
            //
            cameraAndLightCollecter.currentCamera = this._cacheCurrentCamera;
        }

        public draw(drawCall: DrawCall, material: Material | null = null) {
            const webgl = WebGLRenderState.webgl!;
            const camera = cameraAndLightCollecter.currentCamera!;
            const renderer = drawCall.renderer;
            const activeScene = paper.Application.sceneManager.activeScene;
            const currentScene = renderer ? renderer.gameObject.scene : null; // 后期渲染 renderer 为空。TODO，此处场景使用情况进一步确认。
            const mesh = drawCall.mesh;

            if (material === null) {
                material = drawCall.material;
            }

            if (DEBUG) {
                let flag = false;

                if (mesh.isDisposed) {
                    console.error("The mesh has been disposed.", renderer ? renderer.gameObject.path : mesh.name);
                    flag = true;
                }

                if (material.isDisposed) {
                    console.error("The material has been disposed.", renderer ? renderer.gameObject.path : material.name);
                    flag = true;
                }

                if (flag) {
                    return;
                }
            }

            if (renderer && renderer.gameObject._beforeRenderBehaviorCount > 0) {
                let flag = false;
                const isEditor = paper.Application.playerMode === paper.PlayerMode.Editor;

                for (const component of renderer.entity.components) {
                    if (
                        (component.constructor as paper.IComponentClass<paper.IComponent>).isBehaviour &&
                        (!isEditor || (component.constructor as paper.IComponentClass<paper.Behaviour>).executeInEditMode) &&
                        (component as paper.Behaviour).onBeforeRender
                    ) {
                        flag = !(component as paper.Behaviour).onBeforeRender!() || flag;
                    }
                }

                if (flag) {
                    return;
                }
            }
            //
            const forceUpdate = this._updateProgram(currentScene || activeScene, renderer, material);
            const program = this._cacheProgram;
            //
            if (program !== null) {
                const { subMeshIndex } = drawCall;
                const primitive = mesh.glTFMesh.primitives[subMeshIndex];
                const drawMode = primitive.mode === undefined ? gltf.MeshPrimitiveMode.Triangles : primitive.mode;
                // Update attributes.
                if (this._cacheMesh !== mesh || this._cacheSubMeshIndex !== subMeshIndex) {
                    if (program !== primitive.extras!.program) {
                        mesh.needUpdate(MeshNeedUpdate.VertexArray, subMeshIndex);
                        primitive.extras!.program = program;
                    }

                    this._updateAttributes(mesh, subMeshIndex);
                    this._cacheSubMeshIndex = subMeshIndex;
                    this._cacheMesh = mesh;
                }
                // Update global uniforms.
                this._updateGlobalUniforms(program, camera, drawCall, renderer, currentScene, forceUpdate);
                // Update uniforms.
                if (this._cacheMaterial !== material || this._cacheMaterialVersion !== material._version) {
                    this._updateUniforms(program, material);
                    this._cacheMaterialVersion = material._version;
                    this._cacheMaterial = material;
                }
                //  TODO
                // if (techniqueState && renderer.transform._worldMatrixDeterminant < 0) {
                //     if (techniqueState.functions!.frontFace[0] === CCW) {
                //         webgl.frontFace(CW);
                //     }
                //     else {
                //         webgl.frontFace(CCW);
                //     }
                // }
                // Draw.
                if (primitive.extras!.draw !== null) {
                    // TODO 需要更友好的 API 以及防止 mesh cache 的方式。
                    const { offset, count } = primitive.extras!.draw!;

                    if (primitive.indices !== undefined) {
                        const indexAccessor = mesh.getAccessor(primitive.indices);
                        if (drawCall.instanced) {
                            webgl.drawElementsInstanced(drawMode, offset, indexAccessor.componentType, count, drawCall.instanced);
                        }
                        else {
                            webgl.drawElements(drawMode, offset, indexAccessor.componentType, count);
                        }
                    }
                    else {
                        if (drawCall.instanced) {
                            webgl.drawArraysInstanced(drawMode, offset, count, drawCall.instanced);
                        }
                        else {
                            webgl.drawArrays(drawMode, offset, count);
                        }
                    }
                }
                else {
                    if (primitive.indices !== undefined) {
                        const indexAccessor = mesh.getAccessor(primitive.indices);
                        webgl.drawElements(drawMode, indexAccessor.count, indexAccessor.componentType, 0);
                    }
                    else {
                        webgl.drawArrays(drawMode, 0, mesh.vertexCount);
                    }
                }

                if (drawCall.drawCount >= 0) {
                    drawCall.drawCount++;
                }

                this._drawCallCollecter.drawCallCount++;
            }
        }
    }
}
