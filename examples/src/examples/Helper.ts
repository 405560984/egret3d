namespace examples {

    export function createGridRoom() {
        { // Create light.
            const directionalLight = paper.GameObject.create("Directional Light").addComponent(egret3d.DirectionalLight);
            directionalLight.intensity = 0.2;
            directionalLight.transform.setLocalPosition(0.0, 20.0, -10.0).lookAt(egret3d.Vector3.ZERO);
            //
            const pointLight = paper.GameObject.create("Point Light").addComponent(egret3d.PointLight);
            pointLight.decay = 0.0;
            pointLight.distance = 0.0;
            pointLight.castShadows = true;
            pointLight.transform.setLocalPosition(0.0, 10.0, 5.0).lookAt(egret3d.Vector3.ZERO);
        }

        const mesh = egret3d.MeshBuilder.createCube(
            40.0, 40.0, 40.0,
            0.0, 20.0, 0.0,
            40, 40, 40,
        );
        mesh.name = "custom/gridroom.mesh.bin";

        const gameObject = egret3d.DefaultMeshes.createObject(mesh, "Background");
        // gameObject.hideFlags = paper.HideFlags.NotTouchable;
        gameObject.activeSelf = false;

        async function loadResource() {
            const textureA = await RES.getResAsync("textures/grid_a.png") as egret3d.Texture;
            const textureB = await RES.getResAsync("textures/grid_b.png") as egret3d.Texture;
            textureA.gltfTexture.extensions.paper.anisotropy = 4;
            textureB.gltfTexture.extensions.paper.anisotropy = 4;

            const renderer = gameObject.renderer!;
            renderer.receiveShadows = true;
            renderer.materials = [
                egret3d.DefaultMaterials.MESH_LAMBERT.clone()
                    .setTexture(textureA)
                    .setCullFace(true, gltf.FrontFace.CCW, gltf.CullFace.Front)
                    .setUVTransform(egret3d.Matrix3.create().fromUVTransform(0.0, 0.0, 20, 20, 0.0, 0.0, 0.0).release())
                ,
                egret3d.DefaultMaterials.MESH_LAMBERT.clone()
                    .setTexture(textureB)
                    .setCullFace(true, gltf.FrontFace.CCW, gltf.CullFace.Front)
                    .setBlend(egret3d.BlendMode.Normal, egret3d.RenderQueue.Blend)
                ,
            ];
            gameObject.activeSelf = true;
        }

        loadResource();

        return gameObject;
    }
}