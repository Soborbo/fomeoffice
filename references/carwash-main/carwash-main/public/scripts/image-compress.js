// Client-side image compression to WebP using Canvas + createImageBitmap.
// Exposes window.imageCompress = { compressImage, validateCompression }.
// Intentionally vanilla JS — loaded as a static asset, no Vite bundling.

(function () {
  'use strict';

  /**
   * @param {File|Blob} file
   * @param {{maxWidth?:number,maxHeight?:number,quality?:number,format?:'webp'|'jpeg'}} [opts]
   * @returns {Promise<{blob:Blob,originalSize:number,compressedSize:number,width:number,height:number,format:string}>}
   */
  async function compressImage(file, opts) {
    var o = opts || {};
    var maxWidth = o.maxWidth || 1600;
    var maxHeight = o.maxHeight || 1600;
    var quality = typeof o.quality === 'number' ? o.quality : 0.85;
    var format = o.format || 'webp';

    var bitmap = await createImageBitmap(file);
    var width = bitmap.width;
    var height = bitmap.height;

    if (width > maxWidth || height > maxHeight) {
      var scale = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Prefer OffscreenCanvas where available (better off-thread); fall back
    // to a regular HTMLCanvasElement.
    var blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      var oc = new OffscreenCanvas(width, height);
      var ctx = oc.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      blob = await oc.convertToBlob({
        type: format === 'webp' ? 'image/webp' : 'image/jpeg',
        quality: quality,
      });
    } else {
      var c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      var ctx2 = c.getContext('2d');
      if (!ctx2) throw new Error('Canvas 2D unavailable');
      ctx2.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      blob = await new Promise(function (resolve, reject) {
        c.toBlob(
          function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); },
          format === 'webp' ? 'image/webp' : 'image/jpeg',
          quality,
        );
      });
    }

    return {
      blob: blob,
      originalSize: file.size,
      compressedSize: blob.size,
      width: width,
      height: height,
      format: format,
    };
  }

  /**
   * @param {{compressedSize:number,width:number}} result
   * @param {number} [minSizeKb]
   * @param {number} [minWidth]
   * @returns {{ok:boolean, reason?:string}}
   */
  function validateCompression(result, minSizeKb, minWidth) {
    var minKb = typeof minSizeKb === 'number' ? minSizeKb : 30;
    var minW = typeof minWidth === 'number' ? minWidth : 600;
    if (result.width < minW) {
      return { ok: false, reason: 'Image resolution too low — please retake' };
    }
    if (result.compressedSize < minKb * 1024) {
      return { ok: false, reason: 'Image too small — may not be readable' };
    }
    return { ok: true };
  }

  window.imageCompress = {
    compressImage: compressImage,
    validateCompression: validateCompression,
  };
})();
