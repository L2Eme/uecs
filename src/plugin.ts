import { World } from "./world";

/**
 * 一个plugin包括了
 * * component，
 * * 初始化world，一般是添加resource
 * * 执行fixedupdate, 也就是循环过程中每次都要执行的update
 * * 执行taskupdate, 也就是独属于plugin的update
 */
export interface IPlugin {

	/**
	 * 将这个plugin相关的resource放入到world中
	 * @param world 
	 */
	init(world: World): void

	/**
	 * 如果依赖其他system，则在此处初始化
	 */
	startUpdate(): void

	fixedUpdate(): void
	taskUpdate(): void
}
