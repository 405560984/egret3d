namespace egret3d {
    /**
     * 渲染纹理资源。
     */
    export class RenderTexture extends BaseTexture {
        /**
         * 创建一个渲染纹理资源。
         * @param parameters 
         */
        public static create(parameters: CreateTextureParameters): RenderTexture;
        /**
         * 加载渲染纹理资源。
         * @private
         */
        public static create(name: string, config: GLTF): RenderTexture;
        public static create(parametersOrName: CreateTextureParameters | string, config: GLTF | null = null) {
            let name: string;
            let renderTexture: RenderTexture;

            if (typeof parametersOrName === "string") {
                name = parametersOrName;
            }
            else {
                config = this._createConfig(parametersOrName as CreateTextureParameters);
                name = parametersOrName.name !== undefined ? parametersOrName.name : "";
            }

            // Retargeting.
            renderTexture = new egret3d.RenderTexture();
            renderTexture.initialize(name, config!, null);

            return renderTexture;
        }
        /**
         * 激活该纹理资源。
         */
        public activateTexture(): this {
            return this;
        }
        /**
         * 重新设置该纹理资源的尺寸。
         */
        public setSize(width: uint, height: uint): this {
            const extension = this._glTFTexture!.extensions.paper;
            extension.width = Math.min(width, renderState.maxTextureSize);
            extension.height = Math.min(height, renderState.maxTextureSize);
            this.needUpdate(TextureNeedUpdate.Image | TextureNeedUpdate.Buffer | TextureNeedUpdate.Levels);

            return this;
        }
    }
}
