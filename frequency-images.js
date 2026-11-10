(function installFrequencyImages(global) {
  'use strict';

  var MAX_RAW_SIZE = 12 * 1024 * 1024;
  var MAX_SIZE = 2.5 * 1024 * 1024;
  var TARGET_SIZE = 800 * 1024;
  var MAX_PIXELS = 40000000;
  var MAX_EDGE = 1600;
  var QUALITIES = [0.82, 0.75, 0.68, 0.61, 0.55];

  function fail(message) { throw new Error(message); }

  function dimensions(bytes, type) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function ascii(offset, value) {
      return offset + value.length <= bytes.length &&
        Array.prototype.every.call(value, function (char, i) {
          return bytes[offset + i] === char.charCodeAt(0);
        });
    }
    if (type === 'image/png' && bytes.length >= 33 &&
        bytes[0] === 137 && ascii(1, 'PNG\r\n\x1a\n') &&
        view.getUint32(8) === 13 && ascii(12, 'IHDR')) {
      return [view.getUint32(16), view.getUint32(20)];
    }
    if (type === 'image/gif' && bytes.length >= 13 &&
        (ascii(0, 'GIF87a') || ascii(0, 'GIF89a'))) {
      return [view.getUint16(6, true), view.getUint16(8, true)];
    }
    if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
      var offset = 2;
      while (offset < bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        var marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        if (offset + 2 > bytes.length) break;
        var length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].indexOf(marker) >= 0) {
          if (length < 8) break;
          return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
        }
        offset += length;
      }
    }
    if (type === 'image/webp' && bytes.length >= 30 && ascii(0, 'RIFF') && ascii(8, 'WEBP')) {
      if (ascii(12, 'VP8X')) {
        return [1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536,
          1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536];
      }
      if (ascii(12, 'VP8 ') && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
        return [view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383];
      }
      if (ascii(12, 'VP8L') && bytes[20] === 47) {
        var bits = view.getUint32(21, true);
        return [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1];
      }
    }
    fail('Dados de imagem inv\u00e1lidos ou em formato n\u00e3o suportado.');
  }

  function checkDimensions(width, height) {
    if (!width || !height || width * height > MAX_PIXELS) {
      fail('A imagem deve conter no m\u00e1ximo 40 milh\u00f5es de pixels.');
    }
  }

  function dataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reader.onabort = function () { reject(new Error('N\u00e3o foi poss\u00edvel ler o arquivo.')); };
      reader.readAsDataURL(blob);
    });
  }

  function decode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      var timer = setTimeout(function () { finish(false); }, 15000);
      function finish(ok) {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        URL.revokeObjectURL(url);
        if (ok) resolve(image);
        else { image.src = ''; reject(new Error('N\u00e3o foi poss\u00edvel decodificar a imagem.')); }
      }
      image.onload = function () { finish(true); };
      image.onerror = function () { finish(false); };
      image.src = url;
    });
  }

  function encode(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob && blob.type === 'image/jpeg') resolve(blob);
        else reject(new Error('N\u00e3o foi poss\u00edvel codificar a imagem.'));
      }, 'image/jpeg', quality);
    });
  }

  async function prepare(file) {
    if (!(file instanceof Blob) || !file.size) fail('Selecione um arquivo que n\u00e3o esteja vazio.');
    if (file.size > MAX_RAW_SIZE) fail('O arquivo excede o limite de entrada de 12 MiB.');
    var type = file.type.toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'].indexOf(type) < 0) {
      fail('Os formatos suportados s\u00e3o JPEG, PNG, WebP, GIF e PDF.');
    }
    var unchanged = type === 'image/gif' || type === 'application/pdf';
    if (unchanged && file.size > MAX_SIZE) fail('Arquivos GIF e PDF n\u00e3o devem exceder 2,5 MiB.');
    var bytes = new Uint8Array(await file.arrayBuffer());
    if (type === 'application/pdf') {
      if (bytes.length < 5 || String.fromCharCode.apply(null, bytes.subarray(0, 5)) !== '%PDF-') {
        fail('Dados de PDF inv\u00e1lidos.');
      }
    } else {
      var dims = dimensions(bytes, type);
      checkDimensions(dims[0], dims[1]);
    }
    var name = typeof file.name === 'string' && file.name ? file.name : 'anexo';
    var output = file;
    if (type !== 'application/pdf') {
      var image = await decode(file);
      checkDimensions(image.naturalWidth, image.naturalHeight);
      if (!unchanged) {
        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d');
        if (!context) fail('O processamento de imagens est\u00e1 indispon\u00edvel.');
        var scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
        var best = null;
        try {
          // Bound encoding work to five sizes and five quality levels per size.
          for (var pass = 0; pass < 5; pass++) {
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            for (var q = 0; q < QUALITIES.length; q++) {
              var candidate = await encode(canvas, QUALITIES[q]);
              if (!best || candidate.size < best.size) best = candidate;
              if (candidate.size <= TARGET_SIZE) break;
            }
            if (best.size <= TARGET_SIZE) break;
            scale *= 0.8;
          }
          if (file.size > MAX_SIZE || best.size < file.size) {
            output = best;
            name = (name.replace(/\.[^.]*$/, '') || 'foto') + '.jpg';
          }
        } finally {
          canvas.width = canvas.height = 1;
          image.src = '';
        }
      } else image.src = '';
    }
    if (output.size > MAX_SIZE) fail('O arquivo preparado excede o limite de 2,5 MiB.');
    return {
      dataUrl: await dataUrl(output), name: name, size: output.size,
      originalSize: file.size, compressed: output !== file
    };
  }

  global.FrequencyImages = Object.freeze({
    prepare: prepare,
    install: installFrequencyImages,
    constants: Object.freeze({ MAX_RAW_SIZE: MAX_RAW_SIZE, MAX_SIZE: MAX_SIZE,
      TARGET_SIZE: TARGET_SIZE, MAX_PIXELS: MAX_PIXELS, MAX_EDGE: MAX_EDGE })
  });
})(window);
