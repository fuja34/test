

(function () {
  'use strict';


  var CSV_PATH = 'data/data.csv';   
  var IMG_DIR  = 'img/';            
  var VIDEO_EXT = ['mp4', 'mpg', 'mpeg', 'mov', 'm4v', 'webm', 'ogv']; 
  var TITLE_PAGE = '0';             


  var screens = {
    game:    document.getElementById('game-screen'),
    loading: document.getElementById('loading-screen'),
    error:   document.getElementById('error-screen'),
    picker:  document.getElementById('picker-screen')
  };
  var els = {
    pageEl:    document.getElementById('page'),
    media:     document.getElementById('page-media'),
    text:      document.getElementById('page-text'),
    choices:   document.getElementById('page-choices'),
    credit:    document.getElementById('page-credit'),
    errorMsg:  document.getElementById('error-message'),
    fileInput: document.getElementById('csv-file-input'),
    dropZone:  document.getElementById('csv-drop-zone')
  };


  var pages = {};
  var firstPageId = null; 


  showScreen('loading');

  loadData()
    .then(function (text) {
      var rows = parseCsv(text);
      buildPages(rows);

      window.addEventListener('hashchange', render);
      render(); 
    })
    .catch(function (err) {
      showError(
        'データの読み込みに失敗しました。\n' +
        '・data/data.csv が存在するか確認してください。\n' +
        '・CSVの内容を確認してください。\n\n' +
        '詳細: ' + err.message
      );
    });




  function loadData() {
    return loadCsv(CSV_PATH)
      .then(function (text) { return text; })          
      .catch(function () {
        if (typeof window.GAMEBOOK_CSV === 'string' && window.GAMEBOOK_CSV.trim() !== '') {
          return window.GAMEBOOK_CSV;                   
        }
        return waitForUserFile();                       
      });
  }

  function loadCsv(path) {

    var url = path + '?t=' + Date.now();
    return fetch(url).then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' (' + path + ')');
      }
      return res.text();
    });
  }


  function waitForUserFile() {
    return new Promise(function (resolve, reject) {
      showScreen('picker');

      function handleFile(file) {
        if (!file) { return; }
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result)); };
        reader.onerror = function () { reject(new Error('ファイルの読み込みに失敗しました。')); };
        reader.readAsText(file, 'UTF-8');
      }

      els.fileInput.addEventListener('change', function () {
        handleFile(els.fileInput.files && els.fileInput.files[0]);
      });


      var dz = els.dropZone;
      ['dragenter', 'dragover'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) {
          e.preventDefault();
          dz.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach(function (ev) {
        dz.addEventListener(ev, function (e) {
          e.preventDefault();
          dz.classList.remove('is-dragover');
        });
      });
      dz.addEventListener('drop', function (e) {
        var dt = e.dataTransfer;
        handleFile(dt && dt.files && dt.files[0]);
      });
    });
  }





  function parseCsv(text) {

    if (text.charCodeAt(0) === 0xFEFF) {
      text = text.slice(1);
    }
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var i = 0;
    var len = text.length;

    while (i < len) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { 
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += c;
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      }
      if (c === '\r') {
        if (text[i + 1] === '\n') { 
          i++;
          continue;
        }

        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      }
      field += c;
      i++;
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }




  function buildPages(rows) {
    if (!rows.length) {
      throw new Error('CSVが空です。');
    }


    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var idx = {};
    header.forEach(function (name, i) { idx[name] = i; });

    function col(cells, name) {
      var i = idx[name];
      return (i === undefined || cells[i] === undefined) ? '' : cells[i].trim();
    }

    for (var r = 1; r < rows.length; r++) {
      var cells = rows[r];

      if (cells.every(function (v) { return v.trim() === ''; })) {
        continue;
      }

      var id = col(cells, 'page');
      if (id === '') {
        continue; 
      }

      var choices = [];
      for (var n = 1; n <= 3; n++) {
        var ctext = col(cells, 'choice' + n + '_text');
        var cto   = col(cells, 'choice' + n + '_to');
        if (ctext !== '' && cto !== '') {
          choices.push({ text: ctext, to: cto });
        }
      }

      if (Object.prototype.hasOwnProperty.call(pages, id)) {

        console.warn('ページ番号「' + id + '」が重複しています。後の行で上書きされます。');
      }

      var pageObj = {
        id: id,
        text: col(cells, 'text'),
        image: col(cells, 'image'),
        choices: choices
      };

      if (id === TITLE_PAGE) {
        pageObj.credit = col(cells, 'choice2_text');
      }
      pages[id] = pageObj;

      if (firstPageId === null) {
        firstPageId = id;
      }
    }

    if (firstPageId === null) {
      throw new Error('有効なページが1件もありません。');
    }


    Object.keys(pages).forEach(function (pid) {
      pages[pid].choices.forEach(function (ch) {
        if (!Object.prototype.hasOwnProperty.call(pages, ch.to)) {
          console.warn('ページ' + pid + 'の選択肢「' + ch.text + '」の遷移先ページ「' + ch.to + '」が存在しません。');
        }
      });
    });
  }




  function getCurrentPageId() {
    var h = location.hash.replace(/^#/, '');
    try {
      return decodeURIComponent(h);
    } catch (e) {

      return h;
    }
  }

  function render() {
    var id = getCurrentPageId();


    if (id === '') {
      id = TITLE_PAGE;
    }


    if (!Object.prototype.hasOwnProperty.call(pages, id)) {

      if (id === TITLE_PAGE && firstPageId !== null) {
        id = firstPageId;
      } else {
        showError('ページ「' + id + '」が見つかりません。CSVの遷移先を確認してください。');
        return;
      }
    }

    renderPage(pages[id], id === TITLE_PAGE);
    showScreen('game');

    window.scrollTo(0, 0);
  }




  function renderPage(page, isTitle) {

    if (isTitle) {
      els.pageEl.classList.add('is-title');
      if (page.text) { document.title = page.text; } 
    } else {
      els.pageEl.classList.remove('is-title');
    }


    els.media.innerHTML = '';
    if (page.image) {
      els.media.appendChild(createMedia(page.image));
      els.media.hidden = false;
    } else {
      els.media.hidden = true;
    }



    if (!isTitle && page.text) {
      els.text.textContent = page.text; 
      els.text.hidden = false;
    } else {
      els.text.textContent = '';
      els.text.hidden = true;
    }


    els.choices.innerHTML = '';
    if (page.choices.length > 0) {
      page.choices.forEach(function (choice) {
        els.choices.appendChild(makeNavButton(choice.text, choice.to));
      });
    } else if (!isTitle) {

      var end = document.createElement('p');
      end.className = 'the-end';
      end.textContent = 'おわり';
      els.choices.appendChild(end);

      var top = makeNavButton('TOPへ', TITLE_PAGE);
      top.classList.add('top-btn');
      els.choices.appendChild(top);
    }
    els.choices.hidden = false;


    if (isTitle && page.credit) {
      els.credit.textContent = page.credit;
      els.credit.hidden = false;
    } else {
      els.credit.textContent = '';
      els.credit.hidden = true;
    }
  }


  function makeNavButton(text, to) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice-btn';
    btn.textContent = text;
    btn.addEventListener('click', function () {
      location.hash = '#' + to;
    });
    return btn;
  }


  function createMedia(filename) {
    var ext = (filename.split('.').pop() || '').toLowerCase();
    var src = IMG_DIR + filename;

    if (VIDEO_EXT.indexOf(ext) !== -1) {
      var video = document.createElement('video');
      video.className = 'media-el';
      video.src = src;
      video.controls = true;
      video.playsInline = true;
      video.setAttribute('playsinline', ''); 
      video.onerror = function () { this.style.display = 'none'; }; 
      return video;
    }

    var img = document.createElement('img');
    img.className = 'media-el';
    img.src = src;
    img.alt = '';
    img.onerror = function () { this.style.display = 'none'; }; 
    return img;
  }




  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].hidden = (key !== name);
    });
  }

  function showError(message) {
    els.errorMsg.textContent = message;
    showScreen('error');
  }
})();
