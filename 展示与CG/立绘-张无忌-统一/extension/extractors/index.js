/**
 * 站点提取规则
 * 每个 key 匹配 hostname（使用 includes），value 是注入页面执行的 JS 脚本字符串
 * 脚本执行后返回 { text, images, videos?, referer? }
 *
 * 使用方式：在 background service worker 中通过 importScripts 引入
 * 然后根据 tab URL 的 hostname 匹配对应的提取器，通过 Runtime.evaluate 注入页面执行
 */

importScripts('./xiaohongshu.js');
importScripts('./twitter.js');
importScripts('./zhihu.js');
importScripts('./github.js');
importScripts('./juejin.js');
importScripts('./wechat.js');
importScripts('./generic.js');
