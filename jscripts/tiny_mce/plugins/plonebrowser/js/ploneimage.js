/*jslint regexp: true,
         browser: true,
         sloppy: true,
         white: true,
         plusplus: true,
         indent: 4 */
/*global jq, tinymce, tinyMCEPopup */
/**
 * Image selection dialog.
 *
 * @param mcePopup Reference to a corresponding TinyMCE popup object.
 */
var ImageDialog = function (mcePopup) {
    var image_list_url, link_list_url;

    this.tinyMCEPopup = mcePopup;
    this.editor = mcePopup.editor;

    /* In case of UID linked images maintains a relative "resolveuid/<UUID>"
       fragment otherwise contains a full URL to the image. */
    this.current_link = "";

    /* Absolute base URL to an image (without scaling path components)
       regardless whether the image was referenced using an UID or a direct
       link. */
    this.current_url = "";

    /* Currently chosen link plugin value */
    this.current_href = "";
    this.current_pageanchor = "";

    /* List of additional CSS classes set on the <img/> element which have no
       special meaning for TinyMCE. These are passed through as is. */
    this.current_classes = [];
    this.is_search_activated = false;

    /* Translatable UI labels */
    this.labels = this.editor.getParam("labels");

    /* URL of the thumbnail image shown on the right side details pane when
       an image is selected.  */
    this.thumb_url = "";

    /* Hold state if we are updateing image */
    this.editing_existing_image = false;

    // TODO: WTF?
    image_list_url = this.tinyMCEPopup.getParam("external_image_list_url");
    if (image_list_url) {
        jq.getScript(this.editor.documentBaseURI.toAbsolute(image_list_url));
    }
    link_list_url = tinyMCEPopup.getParam("external_link_list_url");
    if (link_list_url) {
        jq.getScript(this.editor.documentBaseURI.toAbsolute(link_list_url));
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
        scaled_image,
        mailaddress,
        mailsubject,
        href,
        current_uid;

    this.tinyMCEPopup.resizeToInnerSize();

    // Determine type of the plugin: link or image
    this.is_link_plugin = window.location.search.indexOf('plonelink') > -1
    this.method_folderlisting = this.is_link_plugin ? 'tinymce-jsonlinkablefolderlisting' : 'tinymce-jsonimagefolderlisting';
    this.method_search = this.is_link_plugin ? 'tinymce-jsonlinkablesearch' : 'tinymce-jsonimagesearch';

    // Setup events
    jq('#action_form', document).submit(function (e) {
        e.preventDefault();
        if (self.is_link_plugin === true) {
            self.insertLink();
        } else {
            self.insertImage();
        }
    });
    jq('#cancel', document).click(function (e) {
        e.preventDefault();
        self.tinyMCEPopup.close();
    });
    jq('#upload', document).click(function (e) {
        e.preventDefault();
        self.displayPanel('upload');
    });
    jq('#uploadbutton', document).click(function (e) {
        e.preventDefault();
        jq('#upload_form', document).submit();
    });
    jq('#searchtext', document).keyup(function (e) {
        e.preventDefault();
        // We need to stop the event from propagating so that pressing Esc will
        // only stop the search but not close the whole dialog.
        e.stopPropagation();
        self.checkSearch(e);
    });
    // handle different folder listing view types
    jq('#general_panel .legend a', document).click(function (e) {
        self.editing_existing_image = true;
        e.preventDefault();
        jq('#general_panel .legend a', document).removeClass('current');
        jq(this).addClass('current');
        // refresh listing with new view settings
        self.getFolderListing(self.folderlisting_context_url, self.folderlisting_method);
    });

    // setup UI based on settings
    if (!this.editor.settings.allow_captioned_images) {
        jq('#caption', document).parent().parent().hide();
    }
    if (this.editor.settings.rooted === true) {
        jq('#home', document).hide();
    }

    // setup UI depending on plugin type
    if (this.is_link_plugin === true) {
        jq('#linktype_panel', document).removeClass('hide');
        this.populateAnchorList();

        // display results as list and disable thumbs view
        jq('#listview', document).click();
        jq('.legend', document).hide();

        // setup link buttons acions
        jq('#linktype a', document).click(function (e) {
            e.preventDefault();
            jq('#linktype_panel p', document).removeClass('current');
            jq(this, document).parent('p').addClass('current');
            switch (jq(this).attr('href')) {
                case "#internal":
                    self.displayPanel('browse');
                    break;
                case "#external":
                    self.displayPanel('external');
                    break;
                case "#email":
                    self.displayPanel('email');
                    break;
                case "#anchor":
                    self.displayPanel('anchor');
                    break;
            }
        });
        jq('#advanced_options', document).click(function (e) {
            self.displayPanel('advanced');
            e.preventDefault();
        });
        jq('#externalurl', document).keyup(self.checkExternalURL);
        jq('#targetlist', document).change(this.setupPopupVisibility);
        jq('#previewexternalurl', document).click(function (e) {
            e.preventDefault();
            self.previewExternalURL();
        });

        /* handle link plugin startup */
        elm = selected_node.parent('a');
        if (elm.length && elm[0].nodeName.toUpperCase() == "A") {
            // element is anchor, we have a link
            href = jq.trim(elm.attr('href'));

            // setup form data
            this.current_href = href;
            if ((typeof(elm.attr('title')) != "undefined")) {
                jq('#title', document).val(elm.attr('title'));
            }

            // determine link type
            if (href.indexOf('#') === 0) {
                this.displayPanel('anchor');
                jq('input:radio[value=' + href + ']', document).click()
            } else if (href.indexOf('mailto:') > -1) {
                this.displayPanel('email');
                href = href.split('mailto:')[1].split('?subject=');
                if (href.length === 2) {
                    mailsubject = href[0];
                    mailaddress = href[1];
                } else {
                    mailsubject = href[0];
                    mailaddress = "";
                }

                jq('#mailaddress').val(mailaddress);
                jq('#mailsubject').val(mailsubject);
            } else if ((href.indexOf('http://') == 0) || (href.indexOf('https://') == 0) || (href.indexOf('ftp://') == 0)) {
                this.displayPanel('external');
                self.checkExternalURL(href);
            } else {
                this.displayPanel('details');
                if (href.indexOf('#') != -1) {
                    this.current_pageanchor = href.split('#')[1];
                    href = href.split('#')[0];
                }
                if (href.indexOf('resolveuid') != -1) {
                    current_uid = href.split('resolveuid/')[1];
                    tinymce.util.XHR.send({
                        url: this.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                        type: 'GET',
                        success: function(text) {
                            self.current_url = this.getAbsoluteUrl(this.editor.settings.document_base_url, text);
                            self.current_link = self.editor.settings.link_using_uids ? href : self.current_url;
                            this.getFolderListing(this.getParentUrl(self.current_url), 'tinymce-jsonlinkablefolderlisting');
                        }
                    });
                } else {
                    self.current_link = this.getAbsoluteUrl(this.editor.settings.document_base_url, href);
                    this.getFolderListing(this.getParentUrl(this.current_link), 'tinymce-jsonlinkablefolderlisting');
                }
            }

            jq('#targetlist', document).val(elm.attr('target'));
        } else {
            // plain text selection
            href = jq.trim(this.editor.selection.getContent());
            if ((href.indexOf('http://') == 0) || (href.indexOf('https://') == 0) || (href.indexOf('ftp://') == 0)) {
                this.displayPanel('external');
                self.checkExternalURL(href);
            } else {
                this.getCurrentFolderListing();
            }
        }

    } else {
        /* handle image plugin startup */
        if (selected_node.get(0).tagName && selected_node.get(0).tagName.toUpperCase() === 'IMG') {
            /** The image dialog was opened to edit an existing image element. **/
            this.editing_existing_image = true;

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

            scaled_image = this.parseImageScale(selected_node.attr("src"));

            // Update the dimensions <select> with the corresponding value.
            jq('#dimensions', document).val(scaled_image.scale);

            if (scaled_image.url.indexOf('resolveuid/') > -1) {
                /** Handle UID linked image **/

                current_uid = scaled_image.url.split('resolveuid/')[1];

                // Fetch the information about the UID linked image.
                jq.ajax({
                    'url': this.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                    'dataType': 'text',
                    'type': 'GET',
                    'success': function (text) {
                        // Store the absolute URL to the UID referenced image
                        self.current_url = self.getAbsoluteUrl(self.editor.settings.document_base_url, text);
                        // Store the image link as UID or full URL based on policy
                        self.current_link = self.editor.settings.link_using_uids ? scaled_image.url : self.current_url;

                        self.getFolderListing(self.getParentUrl(self.current_url), 'tinymce-jsonimagefolderlisting');
                    }
                });
            } else {
                /** Handle directly linked image **/
                this.current_link = this.getAbsoluteUrl(this.editor.settings.document_base_url, scaled_image.url);
                this.getFolderListing(this.getParentUrl(this.current_link), 'tinymce-jsonimagefolderlisting');
            }
        } else {
            /** The image dialog was opened to add a new image. **/
            this.getCurrentFolderListing();
        }
    }
};

/**
 * Parses the image scale (dimensions) from the given URL.
 *
 * The scale URLs used by plone.app.imaging are of the form
 *
 *   http://server.com/some-image.png/@@images/<field>/<scale>
 *
 * where <field> denotes the particular field containing the image and <scale>
 * identifies the particular image scale.
 *
 * For backward compatibility the previous form of image scale URLs is also
 * supported, but only for the "image" field, e.g.
 *
 *   http://server.com/some-image/image_<scale>
 *
 * where <scale> again denotes the particular image scale.
 *
 * Returns an object with the base URL to the image and another relative URL
 * to the image scale, e.g.
 *
 * { 'url': 'http://server.com/some-image',
 *   'scale' : '@@images/image/thumb' }
 *
 * The 'scale' key will always contain the plone.app.imaging type of scale
 * regardless of the original form, effectively rewriting everything to use
 * the @@images view.
 *
 * @param url URL to a possible scaled image.
 */
ImageDialog.prototype.parseImageScale = function (url) {
    var parts,
        last_part,
        scale_pos,
        parsed = {
            "url": url,
            "scale": ""
        };

    if (url.indexOf('/') > -1) {
        parts = url.split('/');
        last_part = parts[parts.length - 1];

        if (last_part.indexOf('image_') > -1) {
            // This is an old-style scale URL. We'll translate the scale to
            // the form used by plone.app.imaging.
            parsed.scale = "@@images/image/" + parts.pop().substring(6);
            parsed.url = parts.join("/");
        } else {
            scale_pos = url.search(/@@images\/[^\/]+\/.+/);
            if (scale_pos > -1) {
                // This is a new style URL
                parsed.url = url.substring(0, scale_pos - 1);
                parsed.scale = url.substring(scale_pos);
            }
        }
    }

    return parsed;
};

/**
 * Returns the URL of the currently selected image.
 *
 */
ImageDialog.prototype.getSelectedImageUrl = function () {
    // First, try to get the URL corresponding to the image that the user
    // selected in the center pane.
    // TODO: User is also able to select an image from the thumbnails view so
    //       it is important that the event handler there also updates the
    //       radio button input so that the selector below will work.
    var href = jq.trim(jq('input:radio[name=internallink]:checked', document).val());

    if (href === '') {
        // TODO: Is this branch necessary anymore?
        // The user didn't select an image from the center pane.  So we
        // default to the URL for the thumbnail image in the right pane.
        href = jq.trim(this.thumb_url);
        if (href !== '') {
            href = this.parseImageScale(href).url;
        }
    }

    return href;
};


ImageDialog.prototype.insertLink = function () {
    //var inst = tinyMCEPopup.editor;
    var elm, elementArray, i;

    buildHref();
    elm = this.editor.selection.getNode();
    elm = this.editor.dom.getParent(elm, "A");

    // Remove element if there is no href
    if (!document.forms[0].href.value) {
        this.tinyMCEPopup.execCommand("mceBeginUndoLevel");
        i = inst.selection.getBookmark();
        inst.dom.remove(elm, 1);
        inst.selection.moveToBookmark(i);
        this.tinyMCEPopup.execCommand("mceEndUndoLevel");
        this.tinyMCEPopup.close();
        return;
    }

    this.tinyMCEPopup.execCommand("mceBeginUndoLevel");

    // Create new anchor elements
    if (elm == null) {
        inst.getDoc().execCommand("unlink", false, null);
        this.tinyMCEPopup.execCommand("CreateLink", false, "#mce_temp_url#", {skip_undo : 1});

        elementArray = tinymce.grep(inst.dom.select("a"), function(n) {return inst.dom.getAttrib(n, 'href') == '#mce_temp_url#';});
        for (i=0; i<elementArray.length; i++)
            setAllAttribs(elm = elementArray[i]);
    } else
        setAllAttribs(elm);

    // Don't move caret if selection was image
    if (elm && (elm.childNodes.length != 1 || elm.firstChild.nodeName != 'IMG')) {
        inst.focus();
        inst.selection.select(elm);
        inst.selection.collapse(0);
        tinyMCEPopup.storeSelection();
    }

    this.tinyMCEPopup.execCommand("mceEndUndoLevel");
    this.tinyMCEPopup.close();
};

/**
 * Handle inserting the selected object into the DOM of the editable area.
 *
 */
ImageDialog.prototype.insertImage = function () {
    var attrs,
        selected_node = this.editor.selection.getNode(),
        href = this.getSelectedImageUrl(),
        dimension,
        classes;

    this.tinyMCEPopup.restoreSelection();

    // Fixes crash in Safari
    if (tinymce.isWebKit) {
        this.editor.getWin().focus();
    }

    // Append the image scale to the URL if a valid selection exists.
    dimension = jq('#dimensions', document).val();
    if (dimension !== "") {
        href += '/' + dimension;
    }

    // Pass-through classes
    classes = [].concat(this.current_classes);
    // Alignment class
    classes.push(jq.trim(jq('#classes', document).val()));
    // Image captioning
    if (this.editor.settings.allow_captioned_images && jq('#caption', document).get(0).checked) {
        classes.push('captioned');
    }

    attrs = {
        'src' : href,
        'class' : classes.join(' ')
    };

    if (selected_node && selected_node.nodeName.toUpperCase() === 'IMG') {
        // Update an existing <img/> element
        this.editor.dom.setAttribs(selected_node, attrs);
    } else {
        // Create a new <img/> element.
        this.editor.execCommand('mceInsertContent', false, '<img id="__mce_tmp" />', {skip_undo : 1});
        this.editor.dom.setAttribs('__mce_tmp', attrs);
        this.editor.dom.setAttrib('__mce_tmp', 'id', '');
        this.editor.undoManager.add();
    }

    // Update the Description of the image
    jq.ajax({
        'url': jq('#description_href', document).val() + '/tinymce-setDescription',
        'type': 'POST',
        'data': {
            'description': encodeURIComponent(jq('#description', document).val())
        }
    });

    this.tinyMCEPopup.close();
};

/**
 * Activates and disables the search feature based on user input.
 */
ImageDialog.prototype.checkSearch = function (e) {
    var el = jq('#searchtext', document),
        len = el.val().length;

    // Activate search when we have enough input and either livesearch is
    // enabled or the user explicitly pressed Enter.
    if (len >= 3 && (this.tinyMCEPopup.editor.settings.livesearch === true || e.keyCode === 13)) {
        this.is_search_activated = true;
        this.getFolderListing(this.tinyMCEPopup.editor.settings.navigation_root_url, this.method_search);
    }

    // Disable search when we have no input or the user explicitly pressed the
    // Escape key.
    if ((len === 0 && this.is_search_activated) || e.keyCode === 27) {
        this.is_search_activated = false;
        el.val('');
        this.getCurrentFolderListing();
    }
};

/**
 * Updates the details pane on the right by fetching image information from
 * the backend.
 *
 * After successful retrieval the right side pane will be updated with a
 * thumbnail of the selected image with information about the caption,
 * alignment and scale.
 *
 * @param image_url URL of the image to fetch.
 */
ImageDialog.prototype.setDetails = function (image_url) {
    var self = this,
        /**
         * Pretty-prints a human readable title for a image scale.
         */
        scale_title = function (scale) {
            if (scale.size[0]) {
                return scale.title + ' (' + scale.size[0] + 'x' + scale.size[1] + ')';
            } else {
                return scale.title;
            }
        };

    this.thumb_url = '';

    jq.ajax({
        'url': image_url + '/tinymce-jsondetails',
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
            } else {
                jq('#previewimagecontainer', document).empty();
                self.thumb_url = "";
            }

            jq('#description', document).val(data.description);
            jq('#description_href', document).val(image_url);

            // Repopulate the <option>s in the dimensions <select> element.
            if (data.scales) {
                dimensions = jq('#dimensions', document).empty();

                jq.each(data.scales, function () {
                    var scale = this,
                        option = jq('<option/>')
                            .attr({'value': scale.value})
                            .text(scale_title(scale));

                    if (option.val() === dimension) {
                        option.attr({'selected': 'selected'});
                    }
                    option.appendTo(dimensions);
                });
            }
            self.displayPanel('details');

            // select radio button in folder listing and mark selected image
            jq('input:radio[name=internallink][value!=' + data.uid_relative_url + ']', document)
                .parent('.item')
                .removeClass('current');
            jq('input:radio[name=internallink][value=' + data.uid_relative_url + ']', document)
                .attr('checked', 'checked')
                .parent('.item')
                .addClass('current');

            self.current_url = image_url;
            self.current_link = self.editor.settings.link_using_uids ? data.uid_url : image_url;

            jq('#titledetails', document).text(data.title);
            if (self.is_link_plugin === true) {
                jq('#classes', document).parents('.field').addClass('hide');
                jq('#dimensions', document).parents('.field').addClass('hide');
            }

            // TODO: remember anchor choice
            if (data.anchors.length > 0) {
                // TODO: complete
                /*
                html = '<select id="pageanchor" name="pageanchor">';
                html += '<option value="">top of page (default)</option>';
                for (var i = 0; i < data.anchors.length; i++) {
                    html += '<option value="' + data.anchors[i] + '">' + data.anchors[i] + '</option>';
                }
                html += '</select>';
                */
                console.log(data.anchors);
            } else {
                jq('#pageanchorcontainer', document).parents('.field').addClass('hide');
            }
        }
    });
};

/**
 * Utility method to update the middle pane with the current context listing.
 */
ImageDialog.prototype.getCurrentFolderListing = function () {
    this.getFolderListing(this.editor.settings.document_base_url, this.method_folderlisting);
};


/**
 * Updates the center pane with a listing of content from the given context.
 *
 * @param context_url URL of the context where the request will be made
 * @param method Name of the backed view to query
 */
ImageDialog.prototype.getFolderListing = function (context_url, method) {
    var self = this;

    // store this for view type refreshing
    this.folderlisting_context_url = context_url;
    this.folderlisting_method = method;

    jq.ajax({
        'url': context_url + '/' + method,
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
                current_uid,
                item_number = 0,
                folder_html = [],
                item_html = [],
                thumb_name = self.editor.settings.thumbnail_size[0],
                thumb_width = self.editor.settings.thumbnail_size[1],
                thumb_height = self.editor.settings.thumbnail_size[2],
                col_items_number = self.editor.settings.num_of_thumb_columns;

            if (data.items.length === 0) {
                html.push(self.labels.label_no_items);
            } else {
                jq.each(data.items, function (i, item) {
                    if (item.url === self.current_link && self.editor.settings.link_using_uids) {
                        self.current_link = 'resolveuid/' + item.uid;
                    }
                    if (item.is_folderish) {
                        folder_html.push('<div class="list item folderish ' + (i % 2 === 0 ? 'even' : 'odd') + '">');
                        if (self.is_link_plugin === true) {
                            jq.merge(folder_html, [
                                '<input href="' + item.url + '" ',
                                    'type="radio" class="noborder" style="margin: 0; width: 16px" name="internallink" value="',
                                    'resolveuid/' + item.uid ,
                                    '"/> '
                            ]);
                        } else {
                            folder_html.push('<img src="img/arrow_right.png" />');
                        }
                        jq.merge(folder_html, [
                                '<img src="' + item.icon +  '"/>',
                                '<a href="' + item.url + '" class="folderlink contenttype-' + item.normalized_type + '">',
                                    item.title,
                                '</a>',
                            '</div>'
                        ]);
                    } else {
                        switch (jq('#general_panel .legend .current', document).attr('id')) {
                            // TODO: use jquery dom to be sure stuff is closed
                            case 'listview':
                                jq.merge(item_html, [
                                    '<div class="item list ' + (i % 2 === 0 ? 'even' : 'odd') + '" title="' + item.description + '">',
                                        '<input href="' + item.url + '" ',
                                            'type="radio" class="noborder" style="margin: 0; width: 16px" name="internallink" value="',
                                            'resolveuid/' + item.uid ,
                                            '"/> ',
                                        '<img src="' + item.icon + '" /> ',
                                        '<span class="contenttype-' + item.normalized_type + '">' + item.title + '</span>',
                                    '</div>'
                                ]);
                                break;
                            case 'thumbview':
                                if (item_number % col_items_number === 0) {
                                    item_html.push('<div class="row">');
                                }
                                jq.merge(item_html, [
                                    '<div class="width-1:' + col_items_number + ' cell position-' + item_number % col_items_number * (16 / col_items_number) + '">',
                                        '<div class="thumbnail item ' + (i % 2 === 0 ? 'even' : 'odd') + '" title="' + item.description +  '">',
                                            '<div style="width: ' + thumb_width + 'px; height: ' + thumb_height + 'px" class="thumb">',
                                                '<img src="' + item.url + '/@@images/image/' + thumb_name + '" alt="' + item.title + '" />',
                                            '</div>',
                                            '<p>' + item.title + '</p>',
                                            '<input href="' + item.url + '" ',
                                                'type="radio" class="noborder" name="internallink" value="',
                                                'resolveuid/' + item.uid,
                                                '"/> ',
                                        '</div>',
                                    '</div>'
                                ]);
                                if (item_number % col_items_number === col_items_number - 1) {
                                    item_html.push('</div>');
                                }
                                item_number++;
                                break;
                        }
                    }

                });
            }
            jq.merge(html, folder_html);
            jq.merge(html, item_html);
            jq('#internallinkcontainer', document).html(html.join(''));

            // display shortcuts
            if (self.is_search_activated === false && self.editor.settings.image_shortcuts_html.length) {
                html = [];
                jq.merge(html, [
                    '<div id="shortcuts" class="browser-separator">',
                        '<img src="img/arrow_down.png" />',
                        '<strong>' + self.labels.label_shortcuts + '</strong>',
                    '</div>'
                ]);
                jq.each(self.editor.settings.image_shortcuts_html, function () {
                    html.push('<div class="item list shortcut">' + this + '</div>');
                });
                jq.merge(html, [
                    '<div class="browser-separator">',
                        '<img src="img/arrow_down.png" />',
                        '<strong>' + self.labels.label_browser + '</strong>',
                    '</div>'
                ]);
                jq('#internallinkcontainer', document).prepend(html.join(''));

                // Shortcuts listing can be hidden
                jq('#shortcuts', document).click(function() {
                    jq('#internallinkcontainer .shortcut', document).toggle();
                });
            }

            // make rows clickable
            jq('#internallinkcontainer div.item', document).click(function() {
                var el = jq(this),
                    checkbox = el.find('input');
                if (checkbox.length > 0) {
                    checkbox.click();
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
                self.getFolderListing(jq(this).attr('href'), self.method_folderlisting);
            });
            // item link action
            jq('#internallinkcontainer input:radio', document).click(function (e) {
                e.preventDefault();
                e.stopPropagation();
                self.setDetails(jq(this).attr('href'));
            });

            // Make the image upload form upload the image into the current container.
            jq('#upload_form', document).attr('action', context_url + '/tinymce-upload');

            // Select image if we are updating existing one
            if (self.editing_existing_image) {
                self.editing_existing_image = false;
                if (self.current_link.indexOf('resolveuid/') > -1) {
                    current_uid = self.current_link.split('resolveuid/')[1];
                    jq.ajax({
                        'url': self.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                        'dataType': 'text',
                        'success': function(text) {
                            self.setDetails(self.getAbsoluteUrl(self.editor.settings.document_base_url, text));
                        }
                        // TODO: handle 410 (image was deleted)
                    });
                } else {
                    self.setDetails(self.current_link);
                }
            }
            self.displayPanel('browse');

            // TODO: Check if upload button should be displayed
            if (data.upload_allowed === true && self.is_search_activated === false) {
                jq('#upload', document).show().attr('disabled', false).fadeTo(1, 1);
            } else {
                jq('#upload', document).hide();
            }

            // Handle search
            if (self.is_search_activated === true) {
                jq('#internalpath', document).prev().text(self.labels.label_search_results);
            } else {
                jq('#internalpath', document).prev().text(self.labels.label_internal_path);
            }
        }
    });
};

/**
 * Returns a URL to the parent (container) of the given URL.
 *
 * @param url URL with at least a single path component.
 */
ImageDialog.prototype.getParentUrl = function (url) {
    var url_array = url.split('/');
    url_array.pop();
    return url_array.join('/');
};

/**
 * Returns an absolute URL based on a base url and a possibly relative link.
 *
 * If the given link is already an absolute URL it will be returned
 * unmodified, otherwise it will be joined with the base URL with any parent
 * references (..) factored out.
 *
 * @param base The base URL
 * @param link The link to calculate an absolute URL for
 */
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

ImageDialog.prototype.displayPanel = function(panel) {
    // handles: details, browse, search, external, email, anchor, upload
    var correction_length;

    // handle upload button
    if (panel === "browse" || panel === "details" && this.is_search_activated === false) {
        jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
    } else {
        jq('#upload', document).attr('disabled', true).fadeTo(1, 0.5);
    }
    // handle insert button
    if (jq.inArray(panel, ["details", "external", "email", "anchor"]) > -1) {
        jq('#insert', document).attr('disabled', false).fadeTo(1, 1);
    } else {
        jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);
    }
    // handle email panel
    if (panel === "email") {
        jq('#email_panel', document).removeClass('hide');
    } else {
        jq('#email_panel', document).addClass('hide');
    }
    // handle anchor panel
    if (panel === "anchor") {
        jq('#anchor_panel', document).removeClass('hide');
    } else {
        jq('#anchor_panel', document).addClass('hide');
    }
    // handle external panel
    if (panel === "external") {
        jq('#external_panel', document).removeClass('hide');
    } else {
        jq('#external_panel', document).addClass('hide');
    }
    // handle advanced panel
    if (panel === "advanced") {
        jq('#advanced_panel', document).removeClass('hide');
    } else {
        jq('#advanced_panel', document).addClass('hide');
    }
    // handle browse panel
    if (jq.inArray(panel, ["search", "details", "browse", "upload"]) > -1) {
        jq('#browseimage_panel', document).removeClass("hide");
        correction_length = this.is_link_plugin ? 145 : 0;
        if (jq.inArray(panel, ["upload", "details"]) > -1) {
            jq('#browseimage_panel', document).width(555 - correction_length);
        } else {
            jq('#browseimage_panel', document).width(790 - correction_length);
        }
    } else {
        jq('#browseimage_panel', document).addClass("hide");
    }
    // handle details/preview panel
    if (panel === 'details') {
        jq('#details_panel', document).removeClass("hide");
    } else {
        jq('#details_panel', document).addClass("hide");
    }
    // handle upload panel
    if (panel === "upload") {
        jq('#addimage_panel', document).removeClass('hide');
    } else {
        jq('#addimage_panel', document).addClass('hide');
    }
};

/* Link type methods */ 

/**
 * Retrieves anchors from current document and populates the list
 */
ImageDialog.prototype.populateAnchorList = function () {
    var nodes,
        html = "",
        divclass = "even",
        name,
        title,
        nodes_length,
        i;

    nodes = this.editor.dom.select('a.mceItemAnchor,img.mceItemAnchor');
    nodes_length = nodes.lengthl
    for (i = 0; i < nodes_length; i++) {
        if ((name = this.editor.dom.getAttrib(nodes[i], "name")) != "") {
            html += '<div class="' + divclass + '"><input type="radio" class="noborder" name="anchorlink" value="#' + name + '"/> ' + name + '</div>';
            divclass = divclass == "even" ? "odd" : "even";
        }
    }

    nodes = this.editor.dom.select('h2,h3');
    nodes_length = nodes.length
    if (nodes.length > 0) {
        for (i = 0; i < nodes_length; i++) {
            title = nodes[i].innerHTML;
            title_match = title.match(/mceItemAnchor/);
            if (title_match == null) {
                name = title.toLowerCase();
                name = name.replace(/[^a-z]/g, '-');
                html += '<div class="' + divclass + '"><input type="radio" class="noborder" name="anchorlink" value="#mce-new-anchor-' + name + '"/> ' + title + '</div>';
                divclass = divclass == "even" ? "odd" : "even";
            }
        }
    }

    if (html == "") {
        html = '<div class="odd">'+ labels['label_no_anchors'] +'</div>';
    }

    jq('#anchorlinkcontainer', document).html(html);
};

/**
 * Strip HTTP scheme from URL and set prefix accordingly
 */
ImageDialog.prototype.checkExternalURL = function (href) {
    var href,
        scheme = href.split('://')[0];

    if (href === undefined) {
        href = jq.trim(jq('#externalurl', document).val());
    }

    if (jq.inArray(scheme, ['http', 'ftp', 'https']) > -1) {
        jq(that).val(href.substr(scheme.length + 3, href.length));
        jq('#externalurlprefix', document).val(scheme + '://');
    }
};

/**
 * Preview webpage if url is set
 */
ImageDialog.prototype.previewExternalURL = function () {
    var url = jq('#externalurl', document).val(),
        urlprefix = jq('#externalurlprefix', document).val();

    if (url === "") {
        jq('#previewexternal', document).attr('src', "about:blank");
    } else {
        jq('#previewexternal', document).attr('src', urlprefix + url);
    }
};

/**
 * Currently disabled functionality
 */
ImageDialog.prototype.setPopupVisibility = function (e) {
    //e.preventDefault();
    //var targetlist = document.getElementById('targetlist');    
    //if (targetlist.options[targetlist.selectedIndex].value == 'popup') {
    //    document.getElementById('popup_panel').style.display = 'block';
    //} else {
    //    document.getElementById('popup_panel').style.display = 'none';
    //}
};


var imgdialog = new ImageDialog(tinyMCEPopup);
tinyMCEPopup.onInit.add(imgdialog.init, imgdialog);

/* These two functions are called from adapters.Upload.py
 * after uploadbutton was pressed
 */
var uploadOk = function uploadOk(current_link) {
    this.editing_existing_image = true;
    imgdialog.current_link = current_link;
    imgdialog.getFolderListing(imgdialog.getParentUrl(current_link), imgdialog.method_folderlisting);
    imgdialog.displayPanel('details');
};

var uploadError = function uploadError(current_link) {
    alert(current_link);
    // TODO: display ajax panel instead of alert
};
