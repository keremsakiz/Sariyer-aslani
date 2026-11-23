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
