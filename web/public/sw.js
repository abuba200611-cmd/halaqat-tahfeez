/*
  عامل الخدمة للسلام — MOS: إشعارات الدفع + تجربة PWA (أصول ثابتة + صفحة /offline).
  قواعد التصنيف في sw-rules.js (مختبَرة). لا نخزّن /api/* ولا HTML موثَّقاً أبداً.
*/
importScripts("/sw-rules.js");
var R = self.MOSSWRules;

self.addEventListener("install", function (event) {
  event.waitUntil(
    (async function () {
      try {
        var offline = await caches.open(R.OFFLINE_CACHE);
        var res = await fetch(R.OFFLINE_URL, { cache: "reload" });
        if (!res.ok) return;
        var html = await res.clone().text();
        await offline.put(R.OFFLINE_URL, res);
        // أصول الصفحة (CSS/JS) والخطوط داخل CSS تُخزَّن لتُرسم /offline كاملة بلا شبكة
        var statics = await caches.open(R.STATIC_CACHE);
        var urls = R.extractStaticUrls(html);
        for (var i = 0; i < urls.length; i++) {
          try {
            var r = await fetch(urls[i]);
            if (!r.ok) continue;
            if (/\.css$/.test(urls[i])) {
              var css = await r.clone().text();
              var fonts = R.extractStaticUrls(css);
              for (var j = 0; j < fonts.length; j++) {
                try {
                  var fr = await fetch(fonts[j]);
                  if (fr.ok) await statics.put(fonts[j], fr);
                } catch {}
              }
            }
            await statics.put(urls[i], r);
          } catch {}
        }
      } catch {
        // فشل التخزين المسبق لا يمنع التثبيت (الدفع يعمل بدونه)
      }
    })().then(function () {
      return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(names.filter(R.isStaleCacheName).map(function (n) { return caches.delete(n); }));
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  var kind = R.classifyRequest({ url: req.url, method: req.method, mode: req.mode, ownOrigin: self.location.origin });
  if (kind === "bypass") return;

  if (kind === "static") {
    // cache-first: أصول مُجزّأة بالهاش فلا تتقادم
    event.respondWith(
      caches.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.type === "basic") {
            var copy = res.clone();
            caches.open(R.STATIC_CACHE).then(function (c) { return c.put(req, copy); });
          }
          return res;
        });
      }),
    );
    return;
  }

  // navigate: شبكة أولاً بلا أي تخزين للرد (قد يكون موثَّقاً)؛ عند الانقطاع فقط /offline
  event.respondWith(
    fetch(req).catch(function () {
      return caches.match(R.OFFLINE_URL).then(function (hit) {
        return hit || Response.error();
      });
    }),
  );
});

/* ————— إشعارات الدفع (دون تغيير) ————— */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "حلقات";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      dir: "rtl",
      lang: "ar",
      tag: data.tag || "halaqat",
      data: { url: data.url || "/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inbox";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
