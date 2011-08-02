/*jslint browser: true, sloppy: true, white: true, plusplus: true, maxerr: 500, indent: 4 */
/**
 * Image selection dialog.
 *
 * @param mcePopup Reference to a corresponding TinyMCE popup object.
 */
var ImageDialog = function (mcePopup) {
    var image_list_url;

    this.tinyMCEPopup = mcePopup;
    this.editor = mcePopup.editor;

    /* In case of UID linked images maintains a relative "resolveuid/<UUID>"
       fragment otherwise contains a full URL to the image. */
    this.current_link = "";

    /* Absolute base URL to an image (without scaling path components)
       regardless whether the image was referenced using an UID or a direct
       link. */
    this.current_url = "";

    /* List of additional CSS classes set on the <img/> element which have no
       special meaning for TinyMCE. */
    this.current_classes = [];
    this.is_search_activated = false;
    this.labels = this.editor.getParam("labels");
    this.thumb_url = "";

    this.tinyMCEPopup.requireLangPack();

    // TODO: WTF?
    image_list_url = this.tinyMCEPopup.getParam("external_image_list_url");
    if (image_list_url) {
        jq.getScript(this.editor.documentBaseURI.toAbsolute(image_list_url));
    }
};


/**
 * Dialog initialization.
 *
 * This will be called when the dialog is activated by pressing the
 * corresponding toolbar icon.
 */
ImageDialog.prototype.init = function () {
    var self = this,
        selected_node = jq(this.editor.selection.getNode(), document),
        image_scale,
        current_uid;

    this.tinyMCEPopup.resizeToInnerSize();

    jq('#action-form', document).submit(function (e) {
        e.preventDefault();
        self.insert();
    });
    jq('#upload', document).click(function (e) {
        e.preventDefault();
        self.displayUploadPanel();
    });
    jq('#cancel', document).click(function (e) {
        e.preventDefault();
        self.tinyMCEPopup.close();
    });
    jq('#searchtext', document).keyup(function (e) {
        e.preventDefault();
        // We need to stop the event from propagating so the pressing Esc will
        // only stop the search but not close the whole dialog.
        e.stopPropagation();
        self.checkSearch(e);
    });

    if (!this.editor.settings.allow_captioned_images) {
        jq('#caption', document).parent().parent().hide();
    }
    if (this.editor.settings.rooted) {
        jq('#home', document).hide();
    }

    if (selected_node.get(0).tagName && selected_node.get(0).tagName.toUpperCase() === 'IMG') {
        /** The image dialog was opened to edit an existing image element. **/

        // Manage the CSS classes defined in the <img/> element. We handle the
        // following classes as special cases:
        //   - captioned
        //   - image-inline
        //   - image-left
        //   - image-right
        // and pass all other classes through as-is.
        jq.each(selected_node.attr('class').split(/\s+/), function () {
            var classname = this.toString();
            switch (classname) {
                case 'captioned':
                    if (self.editor.settings.allow_captioned_images) {
                        // Check the caption checkbox
                        jq('#caption', document).attr('checked', 'checked');
                    }
                    break;

                case 'image-inline':
                case 'image-left':
                case 'image-right':
                    // Select the corresponding option in the "Alignment" <select>.
                    jq('#classes', document).val(classname);
                    break;

                default:
                    // Keep track of custom CSS classes so we can inject them
                    // back into the element later.
                    self.current_classes.push(classname);
                    break;
            }
        });

        image_scale = this.parseImageScale(selected_node.attr("src"));

        // Update the dimensions <select> with the corresponding value.
        jq('#dimensions', document).val(image_scale.value);

        if (image_scale.url.indexOf('resolveuid/') > -1) {
            /** Handle UID linked image **/

            current_uid = image_scale.url.split('resolveuid/')[1];

            // Fetch the information about the UID linked image.
            jq.ajax({
                'url': this.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                'dataType': 'text',
                'type': 'GET',
                'success': function (text) {
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
            /** Handle directly linked image **/
            this.current_link = this.getAbsoluteUrl(this.editor.settings.document_base_url, image_scale.url);
            this.getFolderListing(this.getParentUrl(this.current_link), 'tinymce-jsonimagefolderlisting');
        }
    } else {
        /** The image dialog was opened to add a new image. **/
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
ImageDialog.prototype.parseImageScale = function (url) {
    var parts,
        last_part,
        scale_pos,
        parsed = {
            "url": url,
            "scale": "",
            "value": ""
        };

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

ImageDialog.prototype.getSelectedImageUrl = function () {
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
ImageDialog.prototype.insert = function () {
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

ImageDialog.prototype.insertAndClose = function () {
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
        this.editor.dom.setAttrib('__mce_tmp', 'id', '');
        this.editor.undoManager.add();
    }

    jq.ajax({
        'url': jq('#description_href', document).val() + '/tinymce-setDescription',
        'type': 'POST',
        'data': {
            'description': encodeURIComponent(jq('#description', document).val())
        }
    });

    this.tinyMCEPopup.close();
};

ImageDialog.prototype.checkSearch = function (e) {
    var el = jq('#searchtext', document);
    if (el.val().length >= 3 && (this.tinyMCEPopup.editor.settings.livesearch || e.keyCode === 13)) {
        this.is_activated_search = true;
        this.getFolderListing(this.tinyMCEPopup.editor.settings.navigation_root_url, 'tinymce-jsonimagesearch');
        jq('#upload', document)
            .attr('disabled', true)
            .fadeTo(1, 0.5);
        jq('#internalpath', document).prev().text(this.labels.label_search_results);
    }
    if ((el.val().length === 0 && this.is_activated_search) || e.keyCode === 27) {
        el.val('');
        this.is_activated_search = false;
        this.getCurrentFolderListing();
        jq('#upload', document)
            .attr('disabled', false)
            .fadeTo(1, 1);
        jq('#internalpath', document).prev().text(this.labels.label_internal_path);
    }
};

ImageDialog.prototype.setDetails = function (path) {
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
    var self = this,
        scale_form_key = function (path) {
            var scale_name = path.split('/').pop();
            return scale_name ? 'image_' + scale_name : '';
        },
        scale_title = function (scale) {
            if (scale.size[0]) {
                return scale.title + ' (' + scale.size[0] + 'x' + scale.size[1] + ')';
            } else {
                return scale.title;
            }
        };
    this.thumb_url = null;


    jq.ajax({
        'url': path + '/tinymce-jsondetails',
        'type': 'POST',
        'dataType': 'json',
        'success': function (data) {
            var dimension = jq('#dimensions', document).val(),
                dimensions;

            // Add the thumbnail image to the details pane.
            if (data.thumb !== "") {
                jq('#previewimagecontainer', document)
                    .empty()
                    .append(jq('<img/>').attr({'src': data.thumb}));
                // Save the thumbnail URL for later use.
                self.thumb_url = data.thumb;
            }

            jq('#description', document).val(data.description);
            jq('#description_href', document).val(path);

            // Repopulate the <option>s in the dimensions <select> element.
            if (data.scales) {
                dimensions = jq('#dimensions', document).empty();

                jq.each(data.scales, function () {
                    var scale = this,
                        option = jq('<option/>')
                            .attr({'value': scale_form_key(scale.value)})
                            .text(scale_title(scale));

                    if (option.val() === dimension) {
                        option.attr({'selected': 'selected'});
                    }
                    option.appendTo(dimensions);
                });
            }
            self.displayPreviewPanel();
        }
    });
};

ImageDialog.prototype.getCurrentFolderListing = function () {
    this.getFolderListing(this.editor.settings.document_base_url, 'tinymce-jsonimagefolderlisting');
};

ImageDialog.prototype.getFolderListing = function (path, method) {
    var self = this;

    jq.ajax({
        'url': path + '/' + method,
        'type': 'POST',
        'dataType': 'json',
        'data': {
            'searchtext': encodeURIComponent(jq('#searchtext', document).val()),
            'rooted': this.editor.settings.rooted ? 'True' : 'False',
            'document_base_url': encodeURIComponent(this.editor.settings.document_base_url)
            },
        'success': function (data) {
            var html = [],
                len,
                current_uid;

            if (data.items.length === 0) {
                html.push(self.labels.label_no_items);
            } else {
                jq.each(data.items, function (i, item) {
                    if (item.url === self.current_link && self.editor.settings.link_using_uids) {
                        self.current_link = 'resolveuid/' + item.uid;
                    }
                    if (item.is_folderish) {
                        jq.merge(html, [
                            '<div class="item folderish ' + (i % 2 === 0 ? 'even' : 'odd') + '">',
                                '<img src="img/arrow_right.png" />',
                                '<img src="' + item.icon + '" />',
                                '<a href="' + item.url + '" class="folderlink contenttype-' + item.normalized_type + '">',
                                    item.title,
                                '</a>',
                            '</div>'
                        ]);
                    } else {
                        jq.merge(html, [
                            '<div class="item ' + (i % 2 === 0 ? 'even' : 'odd') + '">',
                                '<input href="' + item.url + '" ',
                                    'type="radio" class="noborder" style="margin: 0; width: 16px" name="internallink" value="',
                                    self.editor.settings.link_using_uids ? 'resolveuid/' + item.uid : item.url,
                                    '"/> ',
                                '<img src="' + item.icon + '" /> ',
                                '<span class="contenttype-' + item.normalized_type + '">' + item.title + '</span>',
                            '</div>'
                        ]);
                    }

                });
            }
            jq('#internallinkcontainer', document).html(html.join(''));

            // shortcuts
            if (method !== 'tinymce-jsonimagesearch' && self.editor.settings.image_shortcuts_html.length) {
                jq('#internallinkcontainer', document).prepend('<div class="browser-separator"><img src="img/arrow_down.png"><strong>' + self.labels.label_browser + '</strong></div>');
                jq.each(self.editor.settings.image_shortcuts_html, function () {
                    jq('#internallinkcontainer', document).prepend('<div class="item shortcut">' + this + '</div>');
                });
                jq('#internallinkcontainer', document).prepend('<div id="shortcuts" class="browser-separator"><img src="img/arrow_down.png"><strong>' + self.labels.label_shortcuts + '</strong></div>');
                jq('#shortcuts', document).click(function() {
                    jq('#internallinkcontainer .shortcut', document).toggle();
                });
            }



            // disable insert until we have selected an item
            jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);

            // make rows clickable
            jq('#internallinkcontainer div', document).click(function() {
                var el = jq(this),
                    checkbox = el.find('input');
                if (checkbox.length) {
                    checkbox[0].click();
                } else {
                    el.find('a').click();
                }
            });

            // breadcrumbs
            html = [];
            len = data.path.length;
            jq.each(data.path, function (i, item) {
                if (i > 0) {
                    html.push(" &rarr; ");
                }
                html.push('<img src="' + item.icon + '" /> ');
                if (i === len - 1) {
                    html.push(item.title);
                } else {
                    html.push('<a href="' + item.url + '">' + item.title + '</a>');
                }

            });
            jq('#internalpath', document).html(html.join(''));

            // folder link action
            jq('#internallinkcontainer a, #internalpath a', document).click(function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.getFolderListing(jq(this).attr('href'), 'tinymce-jsonimagefolderlisting');
            });
            // item link action
            jq('#internallinkcontainer input:radio', document).click(function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.setDetails(jq(this).attr('href'));
            });


            // Check if allowed to upload
            if (data.upload_allowed) {
                jq('#upload', document).show();
            } else {
                jq('#upload', document).hide();
            }

            // Make the image upload form upload the image into the current container.
            jq('#upload_form', document).attr('action', path + '/tinymce-upload');

            if (self.current_link !== "") {
                // In case the current folder listing contains the currently
                // chosen image make sure that the checkbox is checked.
                jq('input:radio[name=internallink][value=' + self.current_link + ']', document)
                    .attr('checked', 'checked');

                if (self.current_link.indexOf('resolveuid/') > -1) {
                    current_uid = self.current_link.split('resolveuid/')[1];
                    jq.ajax({
                        'url': self.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                        'dataType': 'text',
                        'success': function(text) {
                            self.current_url = self.getAbsoluteUrl(self.editor.settings.document_base_url, text);
                            self.setDetails(self.current_url);
                        }
                    });
                } else {
                    self.setDetails(self.current_link);
                }
            }

            self.hidePanels();
        }
    });
};

ImageDialog.prototype.getParentUrl = function(url) {
    var url_array = url.split('/');
    url_array.pop();
    return url_array.join('/');
};

ImageDialog.prototype.getAbsoluteUrl = function (base, link) {
    var base_array,
        link_array,
        item;

    if ((link.indexOf('http://') > -1) || (link.indexOf('https://') > -1) || (link.indexOf('ftp://') > -1)) {
        return link;
    }

    base_array = base.split('/');
    link_array = link.split('/');

    // Remove document from base url
    base_array.pop();

    while (link_array.length > 0) {
        item = link_array.shift();
        if (item === ".") {
            // Do nothing
            jq.noop();
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

ImageDialog.prototype.displayUploadPanel = function() {
    jq('#general_panel', document).width(530);
    jq('#addimage_panel', document).removeClass('hide');
    jq('#details_panel', document).addClass("hide");
    jq('#internallinkcontainer input', document).attr('checked', false);
    // TODO: check if the ORed selector works properly.
    jq('#upload, #insert', document).attr('disabled', true).fadeTo(1, 0.5);
    jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);
};

ImageDialog.prototype.displayPreviewPanel = function() {
    jq('#general_panel', document).width(530);
    jq('#addimage_panel', document).addClass('hide');
    jq('#details_panel', document).removeClass("hide");
    jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
    jq('#insert', document).attr('disabled', false).fadeTo(1, 1);
};

ImageDialog.prototype.hidePanels = function() {
    jq('#general_panel', document).width(790);
    jq('#addimage_panel', document).addClass('hide');
    jq('#details_panel', document).addClass("hide");
    jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
};


var imgdialog = new ImageDialog(tinyMCEPopup);
tinyMCEPopup.onInit.add(imgdialog.init, imgdialog);
