import type {Configuration} from 'webpack';
export const rendererConfig = {module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:{loader:'ts-loader',options:{transpileOnly:true}}},{test:/\.css$/,use:['style-loader','css-loader']}]},resolve:{extensions:['.ts','.tsx','.js']}} satisfies Configuration;

export default rendererConfig;
