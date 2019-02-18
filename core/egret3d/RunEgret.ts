namespace egret3d {
    /**
     * 
     */
    export type RunEgretOptions = {
        defaultScene?: string;
        /**
         * 舞台宽。
         */
        contentWidth?: number;
        /**
         * 舞台高。
         */
        contentHeight?: number;
        /**
         * 是否开启抗锯齿，默认开启。
         */
        antialias?: boolean;
        /**
         * 是否与画布背景色混合，默认不混合。
         */
        alpha?: boolean;
        /**
         * 
         */
        gammaInput?: boolean;

        antialiasSamples?: number;

        canvas?: HTMLCanvasElement;
        webgl?: WebGLRenderingContext;

        playerMode?: paper.PlayerMode;
    };
    /**
     * 引擎启动入口
     */
    export function runEgret(options?: RunEgretOptions) {
        if (!options) {
            options = {};
        }

        console.info("Egret", paper.Application.version, "start.");

        // TODO
        egret.Sound = egret.web ? egret.web.HtmlSound : (egret as any)['wxgame']['HtmlSound']; //TODO:Sound
        (egret.Capabilities as any)["renderMode" + ""] = "webgl";

        const canvas = getMainCanvas(options);

        if (options.alpha === undefined) {
            options.alpha = false;
        }

        if (options.antialias === undefined) {
            options.antialias = true;
        }

        if (options.antialiasSamples === undefined) {
            options.antialiasSamples = 4;
        }

        if (options.contentWidth === undefined) {
            const defaultWidth = 1136;
            if (window.canvas) {
                options.contentWidth = defaultWidth;
            }
            else {
                const div = <HTMLDivElement>document.getElementsByClassName("egret-player")[0]!;
                options.contentWidth = parseInt(div.getAttribute("data-content-width")!) || defaultWidth;
            }
        }

        if (options.contentHeight === undefined) {
            const defaultHeight = 640;
            if (window.canvas) {
                options.contentHeight = defaultHeight;
            }
            else {
                const div = <HTMLDivElement>document.getElementsByClassName("egret-player")[0]!;
                options.contentHeight = parseInt(div.getAttribute("data-content-height")!) || defaultHeight;
            }
        }

        options.canvas = canvas;
        options.webgl = <WebGLRenderingContext>canvas.getContext("webgl", options) || <WebGLRenderingContext>canvas.getContext("experimental-webgl", options);

        paper.Application.initialize(options);
        const systemManager = paper.Application.systemManager;
        const gameObjectContext = paper.Context.getInstance(paper.GameObject);

        systemManager.register(webgl.BeginSystem, gameObjectContext, paper.SystemOrder.Begin, options);
        systemManager.register(AnimationSystem, gameObjectContext, paper.SystemOrder.Animation);
        systemManager.register(MeshRendererSystem, gameObjectContext, paper.SystemOrder.BeforeRenderer);
        systemManager.register(SkinnedMeshRendererSystem, gameObjectContext, paper.SystemOrder.BeforeRenderer);
        systemManager.register(particle.ParticleSystem, gameObjectContext, paper.SystemOrder.BeforeRenderer);
        systemManager.register(Egret2DRendererSystem, gameObjectContext, paper.SystemOrder.BeforeRenderer, options);
        systemManager.register(CameraAndLightSystem, gameObjectContext, paper.SystemOrder.BeforeRenderer);

        systemManager.register(webgl.WebGLRenderSystem, gameObjectContext, paper.SystemOrder.Renderer, options);
        systemManager.register(webgl.InputSystem, gameObjectContext, paper.SystemOrder.End, options);
        systemManager.register(webgl.EndSystem, gameObjectContext, paper.SystemOrder.End, options);
        
        systemManager.preRegisterSystems();

        paper.Application.resume();

        console.info("Egret start complete.");
    }

    function getMainCanvas(options: RunEgretOptions) {
        if (window.canvas) {
            return window.canvas;
        }
        else if (options.canvas) {
            return options.canvas;
        }
        else {
            const div = <HTMLDivElement>document.getElementsByClassName("egret-player")[0];
            const canvas = document.createElement("canvas");
            div.appendChild(canvas);

            return canvas;
        }
    }
}

declare interface Window {
    canvas: HTMLCanvasElement;
    gltf: any;
    paper: any;
    egret3d: any;
}

window.gltf = gltf;
window.paper = paper;
window.egret3d = egret3d;
