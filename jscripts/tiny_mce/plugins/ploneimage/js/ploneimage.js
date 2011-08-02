/**
 * Image selection dialog.
 *
 * @param mcePopup Reference to a corresponding TinyMCE popup object.
 */
var ImageDialog2 = function (mcePopup) {
    var image_list_url;

    this.tinyMCEPopup = mcePopup;
    this.editor = mcePopup.editor;

    this.current_path = "";
    this.current_link = "";
    this.current_url = "";
    /* List of additional CSS classes set on the <img/> element which have no
       special meaning for TinyMCE. */
    this.current_classes = [];
    this.is_search_activated = false;
    this.labels = {};
    this.thumb_url = "";

    this.tinyMCEPopup.requireLangPack();

    if (image_list_url = this.tinyMCEPopup.getParam("external_image_list_url")) {
        document.write('<script language="javascript" type="text/javascript" src="' + this.editor.documentBaseURI.toAbsolute(image_list_url) + '"></script>');
    }
};


/**
 * Dialog initialization.
 *
 * This will be called when the dialog is activated by pressing the
 * corresponding toolbar icon. (TODO: confirm this!)
 */
ImageDialog2.prototype.init = function () {
    var self = this,
        dom = this.editor.dom,
        selected_node = jq(this.editor.selection.getNode(), document);

    // TODO: What is this and why do we eval it?
    this.labels = eval(this.editor.getParam("labels"));

    this.tinyMCEPopup.resizeToInnerSize();

    // stop search on esc key
    jq('#searchtext', document).keyup(function(e) {
        if (e.keyCode === 27) {
            self.checkSearch(e, true);
            return false;
        }
    });

    if (!this.editor.settings.allow_captioned_images) {
        jq('#caption', document).parent().parent().hide();
    }

    if (this.editor.settings.rooted) {
        jq('#home', document).hide();
    }

    // let's see if we are updating the image
    if (selected_node.get(0).tagName.toUpperCase() === 'IMG') {
        // We are working on an image.

        var image_scale = this.parseImageScale(selected_node.attr("src"));

        jq('#dimensions', document).val(image_scale.value);

        var classnames = selected_node.attr('class').split(' ');
        var classname = "";
        for (var i = 0, len = classnames.length; i < len; i++) {
            if (classnames[i] === 'captioned') {
                if (this.editor.settings.allow_captioned_images) {
                    jq('#caption', document).attr('checked', 'checked');
                }
            } else if ((classnames[i] === 'image-inline') ||
                       (classnames[i] === 'image-left') ||
                       (classnames[i] === 'image-right')) {
                classname = classnames[i];
            } else {
                // Keep track of CSS classes that have no special meaning for
                // TinyMCE.
                this.current_classes.push(classnames[i]);
            }
        }

        // Pre-select the correct alignment based on the CSS class.
        jq('#classes', document).val(classname);

        // TODO: nl2.insert.value = ed.getLang('update');

        if (image_scale.url.indexOf('resolveuid') > -1) {
            var current_uid = image_scale.url.split('resolveuid/')[1];

            tinymce.util.XHR.send({
                url : this.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                type : 'GET',
                success : function(text) {
                    self.current_url = self.getAbsoluteUrl(self.editor.settings.document_base_url, text);
                    if (self.editor.settings.link_using_uids) {
                        self.current_link = image_scale.url;
                    } else {
                        self.current_link = self.current_url;
                    }
                    self.getFolderListing(self.getParentUrl(self.current_url), 'tinymce-jsonimagefolderlisting');
                }
            });
        } else {
            var href = this.getAbsoluteUrl(this.editor.settings.document_base_url, image_scale.url);
            this.current_link = href;
            this.getFolderListing(this.getParentUrl(href), 'tinymce-jsonimagefolderlisting');
        }
    } else {
        this.getCurrentFolderListing();
    }
};

/**
 * Parses the image scale (dimensions) from the given URL.
 *
 * Two types of URLs are supported:
 *
 *   http://server.com/some-image/image_<scale>
 *
 * and
 *
 *   http://server.com/some-image/@@images/image/<scale>
 *
 * where <scale> denotes the particular scale for the image.
 * Returns an object with the base URL to the image and another relative URL
 * to the image scale, e.g.
 *
 * { 'url': 'http://server.com/some-image',
 *   'scale' : '@@images/image/thumb',
 *   'value': 'image_thumb' }
 *
 * @param url URL to a possible scaled image.
 */
ImageDialog2.prototype.parseImageScale = function (url) {
    var parts,
        last_part,
        scale_pos,
        parsed = {
            "url": url,
            "scale": "",
            "value": ""};

    if (url.indexOf('/') > -1) {
        parts = url.split('/');
        last_part = parts[parts.length - 1];
        scale_pos = url.indexOf("@@images/image/");

        if (last_part.indexOf('image_') > -1) {
            // This is an old-style scale URL
            parsed.scale = "@@images/image/" + parts.pop().substring(6);
            parsed.url = parts.join("/");
            parsed.value = last_part;
        } else if (scale_pos > -1) {
            // This is a new style URL
            parsed.url = url.substring(0, scale_pos - 1);
            parsed.scale = url.substring(scale_pos);
            parsed.value = 'image_' + last_part;
        }
    }

    return parsed;
};

ImageDialog2.prototype.getSelectedImageUrl = function () {
    // This method provides a single entry point.

    // First, try to get the URL corresponding to the image that the user
    // selected in the center pane.
    var href = jq.trim(jq('input:radio[name=internallink]:checked', document).val());

    if (href === '') {
        // The user didn't select an image from the center pane.  So we
        // default to the URL for the thumbnail image in the right pane.
        href = jq.trim(this.thumb_url);
        if (href !== '') {
            href = href.substring(0, href.indexOf('/@@'));
        }
    }

    return href;
};

/**
 * Handle inserting the selected image into the DOM of the editable area.
 *
 * If the current selection does not have a proper URL to the image the empty
 * <img/> element will be removed from the DOM.
 */
ImageDialog2.prototype.insert = function () {
    var href = this.getSelectedImageUrl();

    if (href === '') {
        if (this.editor.selection.getNode().nodeName.toUpperCase() === 'IMG') {
            this.editor.dom.remove(this.editor.selection.getNode());
            this.editor.execCommand('mceRepaint');
        }

        this.tinyMCEPopup.close();
    } else {
        this.insertAndClose();
    }
};

ImageDialog2.prototype.insertAndClose = function () {
    var args,
        el,
        href,
        dimensions;

    this.tinyMCEPopup.restoreSelection();

    // Fixes crash in Safari
    if (tinymce.isWebKit) {
        this.editor.getWin().focus();
    }

    href = this.getSelectedImageUrl();
    dimensions = jq('#dimensions', document).val();
    if (dimensions !== "") {
        // This makes the URLs use the old "image_<scale>" form instead of
        // @@images/image/<scale>.
        // TODO: How to best handle the image_<scale>/@@images/image/<scale>
        // mismatch?
        href += '/' + dimensions;
    }
    // TODO: Make this more verbose for readability!
    args = {
        src : href,
        'class' : jq.trim(jq('#classes', document).val() +
            ((this.editor.settings.allow_captioned_images && jq('#caption', document).get(0).checked) ? ' captioned' : '') +
            " " + this.current_classes.join(" "))
    };

    el = this.editor.selection.getNode();

    if (el && el.nodeName.toUpperCase() === 'IMG') {
        this.editor.dom.setAttribs(el, args);
    } else {
        this.editor.execCommand('mceInsertContent', false, '<img id="__mce_tmp" />', {skip_undo : 1});
        this.editor.dom.setAttribs('__mce_tmp', args);
        this.editor.dom.setAttrib('__mce_tmp', 'id','');
        this.editor.undoManager.add();
    }

    tinymce.util.XHR.send({
        url : jq('#description_href', document).val() + '/tinymce-setDescription',
        content_type : "application/x-www-form-urlencoded",
        type : "POST",
        data : "description=" + encodeURIComponent(jq('#description', document).val())
    });

    this.tinyMCEPopup.close();
};

ImageDialog2.prototype.checkSearch = function(e, force_end) {
    var el = jq('#searchtext', document);
    if (el.val().length >= 3 && (this.tinyMCEPopup.editor.settings.livesearch || e.keyCode === 13)) {
        this.is_activated_search = true;
        this.getFolderListing(this.tinyMCEPopup.editor.settings.navigation_root_url, 'tinymce-jsonimagesearch');
        jq('#upload', document)
            .attr('disabled', true)
            .fadeTo(1, 0.5);
        jq('#internalpath', document).prev().text(this.labels['label_search_results']);
    }
    if (el.val().length === 0 && this.is_activated_search || force_end) {
        el.val('');
        this.is_activated_search = false;
        this.getCurrentFolderListing();
        jq('#upload', document)
            .attr('disabled', false)
            .fadeTo(1, 1);
        jq('#internalpath', document).prev().text(this.labels['label_internal_path']);
    }
};

// ImageDialog2.prototype.setSwapImage = function (st) {
//     var f = document.forms[0];
//
//     f.onmousemovecheck.checked = st;
//     setBrowserDisabled('overbrowser', !st);
//     setBrowserDisabled('outbrowser', !st);
//
//     if (f.over_list)
//         f.over_list.disabled = !st;
//
//     if (f.out_list)
//         f.out_list.disabled = !st;
//
//     f.onmouseoversrc.disabled = !st;
//     f.onmouseoutsrc.disabled  = !st;
// };
//
// ImageDialog2.prototype.fillClassList = function (id) {
//     var dom = this.tinyMCEPopup.dom, lst = dom.get(id), v, cl;
//
//     if (v = this.tinyMCEPopup.getParam('theme_advanced_styles')) {
//         cl = [];
//
//         tinymce.each(v.split(';'), function(v) {
//             var p = v.split('=');
//
//             cl.push({'title' : p[0], 'class' : p[1]});
//         });
//     } else
//         cl = this.tinyMCEPopup.editor.dom.getClasses();
//
//     if (cl.length > 0) {
//         lst.options[lst.options.length] = new Option(this.tinyMCEPopup.getLang('not_set'), '');
//
//         tinymce.each(cl, function(o) {
//             lst.options[lst.options.length] = new Option(o.title || o['class'], o['class']);
//         });
//     } else
//         dom.remove(dom.getParent(id, 'tr'));
// };
//
// ImageDialog2.prototype.fillFileList = function (id, l) {
//     var dom = this.tinyMCEPopup.dom, lst = dom.get(id), v, cl;
//
//     l = window[l];
//
//     if (l && l.length > 0) {
//         lst.options[lst.options.length] = new Option('', '');
//
//         tinymce.each(l, function(o) {
//             lst.options[lst.options.length] = new Option(o[0], o[1]);
//         });
//     } else
//         dom.remove(dom.getParent(id, 'tr'));
// };
//
// ImageDialog2.prototype.changeAppearance = function () {
//     var f = document.forms[0], img = document.getElementById('alignSampleImg');
//
//     if (img) {
//         if (this.editor.getParam('inline_styles')) {
//             this.editor.dom.setAttrib(img, 'style', f.style.value);
//         } else {
//             img.align = f.align.value;
//             img.border = f.border.value;
//             img.hspace = f.hspace.value;
//             img.vspace = f.vspace.value;
//         }
//     }
// };
//
// ImageDialog2.prototype.changeWidth = function () {
//     var f = document.forms[0], tp, t = this;
//
//     if (!f.constrain.checked || !t.preloadImg) {
//         return;
//     }
//
//     if (f.width.value == "" || f.height.value == "")
//         return;
//
//     tp = (parseInt(f.height.value) / parseInt(t.preloadImg.height)) * t.preloadImg.width;
//     f.width.value = tp.toFixed(0);
// };

ImageDialog2.prototype.setRadioValue = function (name, value, formnr) {
    var elm = document.forms[formnr][name];
    if (typeof (elm) !== 'undefined') {
        if (typeof(elm['value']) === 'undefined') {
            for (var i = 0; i < elm.length; i++) {
                if (elm[i].value === value) {
                    elm[i].checked = true;
                }
            }
        } else {
            if (elm.value === value) {
                elm.checked = true;
            }
        }
    }
};


ImageDialog2.prototype.setDetails = function (path, title) {
    // Sends a low level AJAX request.

    // If our AJAX call succeeds and we get a thumbnail image to display in
    // the right pane, we save that thumbnail image's URL directly on the
    // ImageDialog object for posterity.  Later, we may need the thumbnail
    // image's URL in this case:
    //
    //  1. The user clicks an image and clicks the "edit image" button.
    //  2. The user doesn't select any image from the center pane.
    //  3. The user clicks the "update" button.
    //
    // We always try to use the image that the user selects in the center
    // pane first.  But as in the above case, if the user selects no image
    // in the center pane, we fall back to the thumbnailed image.
    var self = this;
    this.thumb_url = null;

    var scale_form_key = function (path) {
        var scale_name = path.split('/').pop();
        return scale_name ? 'image_' + scale_name : '';
    };
    var scale_title = function (scale) {
        if (scale.size[0]) {
            return scale.title + ' (' + scale.size[0] + 'x' + scale.size[1] + ')';
        } else {
            return scale.title;
        }
    };

    tinymce.util.XHR.send({
        url : path + '/tinymce-jsondetails',
        type : 'POST',
        success : function (text) {
            var data = eval('(' + text + ')'),
                dimension = jq('#dimensions', document).val(),
                dimensions,
                option;

            // Add the thumbnail image to the details pane.
            if (data.thumb !== "") {
                jq('#previewimagecontainer', document)
                    .empty()
                    .append(jq('<img/>').attr({'src': data.thumb}))
                // Save the thumbnail URL for later use.
                self.thumb_url = data.thumb;
            }

            jq('#description', document).val(data.description);
            jq('#description_href', document).val(path);

            // Repopulate the <option>s in the dimensions <select> element.
            if (data.scales) {
                dimensions = jq('#dimensions', document).empty();

                for(var i = 0, len = data.scales.length; i < len; i++) {
                    option = jq('<option/>')
                        .attr({'value': scale_form_key(data.scales[i].value)})
                        .text(scale_title(data.scales[i]));

                    if (option.val() === dimension) {
                        option.attr({'selected': 'selected'});
                    }
                    option.appendTo(dimensions);
                }
            }
            self.current_path = path;
            self.displayPreviewPanel();
        }
    });
};

ImageDialog2.prototype.getCurrentFolderListing = function () {
    this.getFolderListing(this.editor.settings.document_base_url, 'tinymce-jsonimagefolderlisting');
};

ImageDialog2.prototype.getFolderListing = function (path, method) {
    var self = this;

    // Sends a low level Ajax request
    tinymce.util.XHR.send({
        url : path + '/' + method,
        content_type : "application/x-www-form-urlencoded",
        type : 'POST',
        data : "searchtext=" + jq('#searchtext', document).val() + "&rooted=" + (this.editor.settings.rooted ? "True" : "False") + "&document_base_url=" + encodeURIComponent(this.editor.settings.document_base_url),
        success : function(text) {
            var html = [];
            var data = eval('(' + text + ')');
            if (data.items.length === 0) {
                html.push(labels['label_no_items']);
            } else {
                for (var i = 0, len = data.items.length; i < len; i++) {
                    if (data.items[i].url === self.current_link && self.editor.settings.link_using_uids) {
                        self.current_link = 'resolveuid/' + data.items[i].uid;
                    }
                    if (data.items[i].is_folderish) {
                        jq.merge(html, [
                            '<div class="item folderish ' + (i % 2 === 0 ? 'even' : 'odd') + '">',
                                '<img src="img/arrow_right.png" />',
                                '<img src="' + data.items[i].icon + '" />',
                                '<a href="' + data.items[i].url + '" class="folderlink contenttype-' + data.items[i].normalized_type + '">',
                                    data.items[i].title,
                                '</a>',
                            '</div>'
                        ]);
                    } else {
                        jq.merge(html, [
                            '<div class="item ' + (i % 2 == 0 ? 'even' : 'odd') + '">',
                                '<input onclick="ImageDialog.setDetails(\'',
                                    data.items[i].url + '\',\'' + data.items[i].title.replace(/'/g, "\\'") + '\');"',
                                    ' type="radio" class="noborder" style="margin: 0; width: 16px" name="internallink" value="',
                                    self.editor.settings.link_using_uids ? 'resolveuid/' + data.items[i].uid : data.items[i].url,
                                    '"/> ',
                                '<img src="' + data.items[i].icon + '" /> ',
                                '<span class="contenttype-' + data.items[i].normalized_type + '">' + data.items[i].title + '</span>',
                            '</div>'
                        ]);
                    }
                }
            }
            jq('#internallinkcontainer', document).html(html.join(''));

            // shortcuts
            if (method !== 'tinymce-jsonimagesearch' && self.editor.settings.image_shortcuts_html.length) {
                jq('#internallinkcontainer', document).prepend('<div class="browser-separator"><img src="img/arrow_down.png"><strong>' + self.labels['label_browser'] + '</strong></div>');
                var sh = self.editor.settings.image_shortcuts_html;
                for (var i = sh.length - 1; i > -1; i--) {
                    jq('#internallinkcontainer', document).prepend('<div class="item shortcut">' + sh[i] + '</div>');
                }
                jq('#internallinkcontainer', document).prepend('<div id="shortcuts" class="browser-separator"><img src="img/arrow_down.png"><strong>' + self.labels['label_shortcuts'] + '</strong></div>');
                jq('#shortcuts', document).click(function() {
                    jq('#internallinkcontainer .shortcut', document).toggle();
                });
            }


            // folder link action
            jq('#internallinkcontainer div a', document).click(function(e) {
                e.preventDefault();
                e.stopPropagation()
                self.getFolderListing(jq(this).attr('href'), 'tinymce-jsonimagefolderlisting');
            });

            // disable insert until we have selected an item
            jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);

            // make rows clickable
            jq('#internallinkcontainer div', document).click(function() {
                var el = jq(this);
                var checkbox = el.find('input');
                if (checkbox.length) {
                    checkbox[0].click();
                } else {
                    el.find('a').click();
                }
            });

            // breadcrumbs
            html = [];
            for (var i = 0, len = data.path.length; i < len; i++) {
                if (i > 0) {
                    html.push(" &rarr; ");
                }
                html.push('<img src="' + data.path[i].icon + '" /> ');
                if (i === len - 1) {
                    html.push(data.path[i].title);
                } else {
                    jq.merge(html, [
                        '<a href="javascript:ImageDialog.getFolderListing(\'' + data.path[i].url + '\',\'tinymce-jsonimagefolderlisting' + '\')">',
                            data.path[i].title,
                        '</a>'
                        ]);
                }
            }
            jq('#internalpath', document).html(html.join(''));

            // Check if allowed to upload
            if (data.upload_allowed) {
                jq('#upload', document).show();
            } else {
                jq('#upload', document).hide();
            }

            // Set global path
            self.current_path = path;
            jq('#upload_form', document).attr('action', self.current_path + '/tinymce-upload');
//            jq('input:radio[name=internallink][value=' + self.current_link + ']').
            jq('input:radio[name=internallink]')
                .val(self.current_link)
                .attr('checked', 'checked');

            if (self.current_link !== "") {
                if (self.current_link.indexOf('resolveuid') > -1) {
                    current_uid = self.current_link.split('resolveuid/')[1];
                    tinymce.util.XHR.send({
                        url : self.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                        type : 'GET',
                        success : function(text) {
                            self.current_url = self.getAbsoluteUrl(self.editor.settings.document_base_url, text);
                            self.setDetails(self.current_url,'');
                        }
                    });
                } else {
                    self.setDetails(self.current_link,'');
                }
            }

            // Hide all panels
            self.hidePanels();
        }
    });
};

ImageDialog2.prototype.getParentUrl = function(url) {
    var url_array = url.split('/');
    url_array.pop();
    return url_array.join('/');
};

ImageDialog2.prototype.getAbsoluteUrl = function (base, link) {
    var base_array,
        link_array;

    if ((link.indexOf('http://') > -1) || (link.indexOf('https://') > -1) || (link.indexOf('ftp://') > -1)) {
        return link;
    }

    base_array = base.split('/');
    link_array = link.split('/');

    // Remove document from base url
    base_array.pop();

    while (link_array.length > 0) {
        var item = link_array.shift();
        if (item === ".") {
            // Do nothing
        } else if (item === "..") {
            // Remove leave node from base
            base_array.pop();
        } else {
            // Push node to base_array
            base_array.push(item);
        }
    }

    return base_array.join('/');
};

ImageDialog2.prototype.displayUploadPanel = function() {
    jq('#general_panel', document).width(530);
    jq('#addimage_panel', document).removeClass('hide');
    jq('#details_panel', document).addClass("hide");
    jq('#internallinkcontainer input', document).attr('checked', false);
    // TODO: check if the ORed selector works properly.
    jq('#upload, #insert', document).attr('disabled', true).fadeTo(1, 0.5);
    jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);
};

ImageDialog2.prototype.displayPreviewPanel = function() {
    jq('#general_panel', document).width(530);
    jq('#addimage_panel', document).addClass('hide');
    jq('#details_panel', document).removeClass("hide");
    jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
    jq('#insert', document).attr('disabled', false).fadeTo(1, 1);
};

ImageDialog2.prototype.hidePanels = function() {
    jq('#general_panel', document).width(790);
    jq('#addimage_panel', document).addClass('hide');
    jq('#details_panel', document).addClass("hide");
    jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
};

function uploadOk(ok_msg) {
    ImageDialog.current_link = ok_msg;
    ImageDialog.getFolderListing(ImageDialog.current_path, 'tinymce-jsonimagefolderlisting');
}

function uploadError(error_msg) {
    alert (error_msg);
}


var ImageDialog = new ImageDialog2(tinyMCEPopup);
tinyMCEPopup.onInit.add(ImageDialog.init, ImageDialog);
