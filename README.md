# Sarıyer Aslanı

Sarıyer'de kaçan bir dişi aslanın hikâyesi. iPad Safari'de oynanabilen 3D tarayıcı oyunu (Three.js, derleme adımı yok).

**Oyna:** https://keremsakiz.github.io/Sariyer-aslani/

## Oynanış
- Uskumruköy'deki villadan kaçış sinematiğiyle başlar.
- Survival: açlık, susuzluk, enerji. Göllerden su iç, tavşan, karaca ve yaban domuzu avla.
- İnsanlarla karşılaşınca 3 seçenek: **Saldır** (polis silahlanır), **Fotoğraf çektir** (+100 puan, konum sosyal medyada yayılır), **Uzak dur** (+15 puan, ihbar edilirsin).
- Arama helikopteri (ağaç altında saklan), termal drone (suya gir), hayvan kontrol ekipleri (uyuşturucu iğne).
- Aç ya da susuz kalınca yavru seraplar görünür ve yolu gösterir.
- Sonlar: ölüm, yakalanma (hayvanat bahçesi), villaya dönüş (normal son) ve 600 puanla yavrulara kavuşma (gerçek son).

## Kontroller
- iPad: sol taraf joystick, sağ taraf kamera; Koş, Sin, Eylem (Avlan / Su İç), Kükre tuşları.
- Klavye: WASD, Shift koş, C sin, E eylem, R kükre.

## Dosyalar
- `src/world.js` dünya, `src/feline.js` aslan ve yavrular, `src/characters.js` insanlar ve av hayvanları
- `src/main.js` oyun mantığı, `src/cinema.js` sinematikler, `src/audio.js` prosedürel sesler
- `lib/three.module.min.js` Three.js r170 (MIT)

## v2: iOS ve App Store hazırlığı
- **Uyarlanabilir kalite:** FPS 45'in altına düşerse çözünürlük, bloom, gölge ve görüş mesafesi kademeli düşer. iPhone/iPad 2. kademeden başlar. Elle seçmek için adrese `?q=0` (en yüksek) … `?q=3` (en hafif) ekle.
- **Parçalı çizim:** ağaç, çalı, kaya ve evler 160 m'lik parçalara bölündü; kameranın görmediği ve uzaktaki parçalar çizilmez.
- **Yeni insanlar:** Quaternius iskeletli karakterleri (CC0, AKINTI projesinden), kıyafet renkleri ve pozlar kodla.
- **Yeni su:** derinliğe göre renk, kıyı köpüğü, dalgacık, ay/güneş parıltısı.
- **Tek dosya derleme (Capacitor için):** `npm install && node build.mjs` → `dist/index.html` (modeller dahil, internet gerekmez).

## v3: oyun hissi, arayüz ve ölçülü performans
- **His:** darbelerde kademeli geri bildirim (küçük/orta/büyük): sarsıntı (trauma², gerçek zamanla söner), kısa vuruş duraklaması, titreşim. Skor artınca zıplar.
- **Duraklatma ve ayarlar:** ⏸ düğmesi, Esc/P, uygulama arka plana geçince otomatik. Ekran sarsıntısı, titreşim ve "sakin efektler" ayarı (kaydedilir).
- **Performans:** uzak ağaç taçları basit geometriye geçer, gövdeler yarı mesafede gizlenir. HUD yalnızca değer değişince yazılır. Ölçüm için `window.__prof = {}`.
- **Sağlamlık:** iOS WebGL bağlamı düşerse sayfa kendini yeniler.

## v4: görsel yenileme
- Doğa: Quaternius "Ultimate Stylized Nature" (CC0) ağaç, çam, çalı, kaya, çimen, çiçek modelleri. Yakında detaylı model, uzakta basit model; kamera çevresinde zemin örtüsü.
- Karaca: Quaternius "Ultimate Animated Animals" (CC0) hareketli geyik modeli (otlama, yürüme, dörtnala, ölüm).
- Dişi aslan: kesitlerden örülmüş tek parça gövde, kas yapılı bacaklar, parmaklı pençeler ve kodla üretilen kürk dokusu.
- İnsanlar: gövdeden türetilen gerçek giysi ağı (tişört/uzun kol, pantolon/şort, ayakkabı) ve saç; kişi başına tek ek çizim.
- Köy evleri: kodla üretilen şablonlar (sıvalı duvar, kiremit kırma çatı, panjurlu pencereler, balkon, baca); gece pencerelerin bir kısmı yanar. Villa: düz çatılı modern bina, cam bantlar, teras.
- Lisans notları: `assets/LICENSE_Quaternius_*.txt`.
