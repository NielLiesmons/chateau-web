export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["fonts/ClashDisplay-Bold.woff2","fonts/ClashDisplay-Extralight.woff2","fonts/ClashDisplay-Light.woff2","fonts/ClashDisplay-Medium.woff2","fonts/ClashDisplay-Regular.woff2","fonts/ClashDisplay-Semibold.woff2","fonts/ClashDisplay-Variable.woff2","fonts/geist-mono-latin-400-normal.woff2","fonts/geist-sans-latin-400-normal.woff2","fonts/geist-sans-latin-600-normal.woff2","fonts/geist-sans-latin-700-normal.woff2","fonts/inter-latin-400-normal.woff2","fonts/inter-latin-500-normal.woff2","fonts/inter-latin-600-normal.woff2","fonts/inter-latin-700-normal.woff2","fonts/jetbrains-mono-400-normal.woff2","fonts/jetbrains-mono-700-normal.woff2","images/emoji/album.png","images/emoji/app.png","images/emoji/app_pack.png","images/emoji/article.png","images/emoji/badge.png","images/emoji/book.png","images/emoji/chat.png","images/emoji/comment.png","images/emoji/community.png","images/emoji/documentation.png","images/emoji/emoji_pack.png","images/emoji/event.png","images/emoji/file.png","images/emoji/form.png","images/emoji/forum.png","images/emoji/gif_pack.png","images/emoji/graph.png","images/emoji/group.png","images/emoji/job.png","images/emoji/joke.png","images/emoji/label.png","images/emoji/live.png","images/emoji/mail.png","images/emoji/music.png","images/emoji/note.png","images/emoji/podcast.png","images/emoji/poll.png","images/emoji/product.png","images/emoji/profile.png","images/emoji/relay.png","images/emoji/repo.png","images/emoji/repository.png","images/emoji/supporter.png","images/emoji/task.png","images/emoji/thread.png","images/emoji/unknown.png","images/emoji/video.png","images/emoji/welcome.png","images/emoji/white_board.png","images/emoji/wiki.png","images/emoji/work_out.png","images/emoji/zap.png","images/emoji/zapstore.png","images/emoji/zapstore_dev.png","images/emoji/zapstore_studio.png","images/logo.svg","logo.svg"]),
	mimeTypes: {".woff2":"font/woff2",".png":"image/png",".svg":"image/svg+xml"},
	_: {
		client: {start:"_app/immutable/entry/start.DmPDctiL.js",app:"_app/immutable/entry/app.CDxaIXjQ.js",imports:["_app/immutable/entry/start.DmPDctiL.js","_app/immutable/chunks/91vR1clj.js","_app/immutable/chunks/u-V2FJD4.js","_app/immutable/chunks/BMWA8cxH.js","_app/immutable/entry/app.CDxaIXjQ.js","_app/immutable/chunks/u-V2FJD4.js","_app/immutable/chunks/BZ1xnMgt.js","_app/immutable/chunks/C3naZ_aw.js","_app/immutable/chunks/BMWA8cxH.js","_app/immutable/chunks/D3MJBUHS.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js'))
		],
		remotes: {
			
		},
		routes: [
			
		],
		prerendered_routes: new Set(["/"]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
