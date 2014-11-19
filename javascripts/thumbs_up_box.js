var ThumbBox = function(options) {
  options = options || {};
  this.issue_url = options.issue_url || document.location.href;
  this.impression = options.impression;
  if (options.size === 'small') {
    this.container_class = 'bountysource-thumbs-box-mini';
    this.image_path = chrome.extension.getURL('images/thumbsup-20.png');
  } else {
    this.container_class = 'bountysource-thumbs-box';
    this.image_path = chrome.extension.getURL('images/thumbsup-32.png');
  }

  this.createDom();
  this.setInfoBox('spinner');
};

ThumbBox.loadAllData = function(instances, attempts) {
  var urls = [];
  for (var i=0; i < instances.length; i++) {
    urls.push(instances[i].issue_url);
  }

  attempts = (attempts || 0) + 1;
  Bountysource.api({
    method: 'POST',
    path: '/thumbs/index',
    body: {
      urls: urls,
      is_retry: (attempts > 1),
      impression: instances[0].impression
    },
    success: function(response) {
      if (response.length !== instances.length) {
        console.log("ERROR4, unexpected response", instances.length, response.length);
        for (var i=0; i < instances.length; i++) {
          instances[i].setInfoBox('ERR4');
        }
      } else {
        var retry_instances = [];

        for (var i=0; i < response.length; i++) {
          if (response[i].issue_id) {
            instances[i].setResponse(response[i]);
          } else if (response[i].retry) {
            retry_instances.push(instances[i]);
          } else {
            console.log("ERROR1", response[i]);
            instances[i].setInfoBox('ERR1');
          }
        }

        if ((retry_instances.length > 0)) {
          if (attempts < 8) {
            console.log("RETRYING", attempts, retry_instances.length, parseInt(Math.pow(1.5, attempts-1) * 1000));
            setTimeout(ThumbBox.loadAllData.bind(null, retry_instances, attempts), parseInt(Math.pow(1.5, attempts-1) * 1000));
          } else {
            console.log("ERROR2: too many retries");
            for (var j=0; j < retry_instances.length; j++) {
              retry_instances[j].setInfoBox('ERR2');
            }
          }
        }
      }
    },
    error: function(response) {
      console.log("ERROR3", response);
      for (var i=0; i < instances.length; i++) {
        instances[i].setInfoBox('ERR3');
      }
    }
  });
};

ThumbBox.prototype.createDom = function() {
  this.container = document.createElement('div');
  this.container.className = this.container_class;

  this.thumb_wrapper = document.createElement('div');
  this.thumb_wrapper.className = 'thumb-wrapper';
  this.thumb_wrapper.addEventListener('click', this.thumbClicked.bind(this));
  this.container.appendChild(this.thumb_wrapper);

  this.thumb_image = document.createElement('img');
  this.thumb_image.src = this.image_path;
  this.thumb_wrapper.appendChild(this.thumb_image);

  this.info_wrapper = document.createElement('div');
  this.info_wrapper.className = 'info-wrapper';
  this.container.appendChild(this.info_wrapper);
};

ThumbBox.prototype.setInfoBox = function(text) {
  if (text === 'spinner') {
    var spinner_image = document.createElement('img');
    spinner_image.src = chrome.extension.getURL('images/spinner.gif');
    this.info_wrapper.innerHTML = '';
    this.info_wrapper.appendChild(spinner_image);
  } else {
    this.info_wrapper.innerHTML = text;
  }
};

ThumbBox.prototype.setResponse = function(response) {
  this.api_response = response;
  this.setInfoBox(response.thumbs_up_count);
  this.container.className = this.container_class + (response.has_thumbed_up ? ' has-thumbed-up' : '');
};

ThumbBox.prototype.thumbClicked = function() {
  if (this.api_response && this.api_response.issue_id) {
    Bountysource.api({
      method: 'POST',
      path: '/thumbs',
      body: {
        issue_id: this.api_response.issue_id,
        downvote: !!this.api_response.has_thumbed_up
      },
      success: function(response) {
        if (response.redirect_to) {
          document.location.href = response.redirect_to;
        } else if (response.issue_id) {
          this.setResponse(response);
        } else {
          console.log("ERROR6", response);
          this.setInfoBox('ERR6');
        }
      }.bind(this),
      error: function(response) {
        console.log("ERROR5", response);
        this.setInfoBox('ERR5');
      }.bind(this)
    });
  }
};


/* hook into the page DOM */
(function() {
  // Github (single page app so use fancy timers)
  if (document.location.href.match(/^https:\/\/github\.com\//)) {
    var previousGithubPath = null;
    var checkGithubUrlForChange = function() {
      var currentGithubPath = document.location.pathname + document.location.search;
      if ((currentGithubPath !== previousGithubPath) && !document.querySelector('.is-context-loading')) {
        previousGithubPath = currentGithubPath;

        if (previousGithubPath.match(/^\/[^/]+\/[^/]+\/(issues|pull)\/\d+/) && !document.querySelector('.repo-private-label')) {
          var header = document.querySelector('#show_issue,.view-pull-request');

          if (header.className.indexOf('bountysource-thumbs-github-indent-header') === -1) {
            header.className = header.className + ' bountysource-thumbs-github-indent-header';
          }

          if (!header.querySelector('.bountysource-thumbs-box')) {
            var box = new ThumbBox({ impression: 'show' });
            header.insertBefore(box.container, header.firstChild);
            ThumbBox.loadAllData([box]);
          }
        } else if (previousGithubPath.match(/^\/[^/]+\/[^/]+\/(issues|pulls)/) && !document.querySelector('.repo-private-label')) {
          var issues = document.querySelectorAll('.issue-title');
          var boxes = [];

          for (var i=0; i < issues.length; i++) {
            var issue_url = issues[i].getElementsByTagName('a')[0].href;
            var meta = issues[i].querySelector('.issue-meta');

            var old_box = issues[i].querySelector('.bountysource-thumbs-box-mini');
            if (old_box) {
              old_box.parentNode.removeChild(old_box);
            }
            var new_box = new ThumbBox({ issue_url: issue_url, size: 'small', impression: 'index' });
            boxes.push(new_box);
            new_box.container.style.marginRight = '3px';
            meta.insertBefore(new_box.container, meta.firstChild);
          }
          ThumbBox.loadAllData(boxes);
        }

      }
      setTimeout(checkGithubUrlForChange, 50);
    };
    checkGithubUrlForChange();


    // Launchpad
  } else if (document.location.href.match(/^https:\/\/bugs\.launchpad\.net\/[^?]+\/\+bug\/\d+$/)) {
    var box = new ThumbBox({ impression: 'show' });
    var header = document.querySelector('.context-publication');
    header.parentNode.insertBefore(box.container, header);
    header.style.marginLeft = '60px';
    ThumbBox.loadAllData([box]);

    // Bugzilla
  } else if (document.location.href.match(/^https?:\/\/[^?]*\/show_bug\.cgi/)) {
    var box = new ThumbBox({ impression: 'show' });
    var header = document.querySelector('.bz_alias_short_desc_container,.page-header');
    header.parentNode.insertBefore(box.container, header);
    header.style.marginLeft = '60px';
    if (['bugzilla.gnome.org','bugzilla.mozilla.org'].indexOf(document.location.host) >= 0) {
      header.style.marginBottom = '36px';
    }
    ThumbBox.loadAllData([box]);

    // Jira (not working with https://jira.reactos.org/browse/CORE-2853)
    // } else if (document.querySelector('meta[name="application-name"][content="JIRA"]')) {
    //   var header = document.querySelector('.aui-page-header-inner,.issue-header-content');
    //   header.parentNode.insertBefore((new ThumbBox()).container, header);
    //   header.style.marginLeft = '60px';

  }
})();
