export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["images/emoji/album.png","images/emoji/app.png","images/emoji/app_pack.png","images/emoji/article.png","images/emoji/badge.png","images/emoji/book.png","images/emoji/chat.png","images/emoji/comment.png","images/emoji/community.png","images/emoji/documentation.png","images/emoji/emoji_pack.png","images/emoji/event.png","images/emoji/file.png","images/emoji/form.png","images/emoji/forum.png","images/emoji/gif_pack.png","images/emoji/graph.png","images/emoji/group.png","images/emoji/job.png","images/emoji/joke.png","images/emoji/label.png","images/emoji/live.png","images/emoji/mail.png","images/emoji/music.png","images/emoji/note.png","images/emoji/podcast.png","images/emoji/poll.png","images/emoji/product.png","images/emoji/profile.png","images/emoji/relay.png","images/emoji/repo.png","images/emoji/repository.png","images/emoji/supporter.png","images/emoji/task.png","images/emoji/thread.png","images/emoji/unknown.png","images/emoji/video.png","images/emoji/welcome.png","images/emoji/white_board.png","images/emoji/wiki.png","images/emoji/work_out.png","images/emoji/zap.png","images/emoji/zapstore.png","images/emoji/zapstore_dev.png","images/emoji/zapstore_studio.png"]),
	mimeTypes: {".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.BIROqEyi.js",app:"_app/immutable/entry/app.DxESjF-V.js",imports:["_app/immutable/entry/start.BIROqEyi.js","_app/immutable/chunks/B2x4zIgo.js","_app/immutable/chunks/EfSAOs5R.js","_app/immutable/chunks/CaAB_dJv.js","_app/immutable/entry/app.DxESjF-V.js","_app/immutable/chunks/EfSAOs5R.js","_app/immutable/chunks/CDxoxSE6.js","_app/immutable/chunks/Bg0UIATt.js","_app/immutable/chunks/Cu2QkzTx.js","_app/immutable/chunks/CaAB_dJv.js","_app/immutable/chunks/BUqRwht_.js","_app/immutable/chunks/CzUfCfTu.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
