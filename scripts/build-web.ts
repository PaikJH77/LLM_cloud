import webpack from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { resolve } from "node:path";
import { rendererConfig } from "../apps/desktop/webpack.renderer.config";
await new Promise<void>((done,fail)=>webpack({
 ...rendererConfig,mode:"production",target:"web",context:resolve("."),entry:"./apps/web/src/client/index.tsx",
 output:{path:resolve("dist/web"),filename:"assets/app.[contenthash].js",publicPath:"/",clean:true},
 plugins:[new HtmlWebpackPlugin({template:resolve("apps/web/src/client/index.html")})],
},(error,stats)=>{if(error)return fail(error);console.log(stats?.toString({all:false,assets:true,errors:true,warnings:true}));if(stats?.hasErrors())return fail(new Error("Web build failed"));done();}));
