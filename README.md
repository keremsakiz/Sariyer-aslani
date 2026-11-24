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
- Klavye: WASD, Shift koş, C sin, E eylem, R kükre, M harita.

## Dosyalar
- `src/world.js` dünya, `src/feline.js` aslan ve yavrular, `src/characters.js` insanlar ve av hayvanları
- `src/critters.js` tavşan ve yaban domuzu, `src/houses.js` ev şablonları, `src/minimap.js` mini harita
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

## v5: hayvanlar, orman, takipçiler ve harita
- Tavşan ve yaban domuzu: kodla örülmüş gövdeler, kürk/kıl dokusu; tavşan zıplar, oturup etrafı kollar; domuz toprağı eşeler, saldırırken başını eğer.
- Orman: ağaç sayısı yaklaşık 3 katı, batıda sık orman, aralarda açıklıklar. Kamera ile aslan arasındaki yapraklar şeffaflaşır.
- Takipçiler: görüş konisi ve ağaç/çalı arkasından görüş hattı, giderek dolan şüphe, son görülen yere gitme, genişleyen arama, yorulma ve 40 sn sonra vazgeçme. Yalnızca seni görürken ateş ederler.
- Helikopter: ışık aslandan yavaş hareket eder; ağaç altı, çalı ve inde göremez. 40 sn bulamazsa ya da yakıtı biterse (150 sn) ayrılır, bir süre geri gelmez.
- Mini harita: yön sabit (bakış yukarı), arazi gölgesi, orman, yollar, patikalar, evler, takipçilerin görüş konileri, helikopter ışığı. Dokununca (ya da M) kuzey yukarı büyük harita açılır.

## v6: ayarlar, harita ve serap
- Ayarlar (⚙️ ya da ⏸): **Oyun** sekmesinde Kolay / Normal / Zor ve Özel; açlık-susuzluk hızı, takipçi hızı, fark edilme hızı, atış isabeti, helikopter sıklığı (0 = kapalı) ve arama süresi kaydırıcıları. **Görüntü**: kalite (Otomatik/Ultra/Yüksek/Orta/Düşük), FPS göstergesi, mini harita boyutu, sarsıntı, sakin efektler. **Ses**: genel, efektler, ortam. **Kontroller**: kamera hassasiyeti, dikey ters, solak düzeni, koş tuşu aç/kapa, titreşim. Hepsi cihazda saklanır.
- Takipçiler aslanı itmez: silahlılar menzilde durup nişan alır, silahsızlar uzaktan izler; aslan üstlerine yürürse geri çekilir, çok yaklaşırsa kaçarlar. Yakalanma sahnesinde ekip uyuyan aslana yaklaşır.
- Mini harita: iki parmak ya da tekerlekle yakınlaştırma, sade pusula (K/D/G/B) ve altında yön + koordinat. Büyük harita: yakınlaştırma, sürükleme, ＋/－/📍 düğmeleri.
- Yavrular: iri kafa, kısa burun, mavi-gri gözler, kabarık yanaklar; oyun hareketleri (sinip atlama, yuvarlanma, kuyruk dik).
- Serap: altın kenar ışıltılı, titreşen ve çözülerek kaybolan hayalet yavrular; birbirleriyle oynar, anneyi fark eder, ine doğru koşup parlayan pati izleri bırakır. Ekranda kenarlarda sıcak hava dalgalanması.
