var ImageDialog = {
    current_path : "",
    current_link : "",
    current_url : "",
    current_class : "",
    is_search_activated : false,
    labels : "",
    thumb_url : null,
    
    preInit : function() {
        var url;

        tinyMCEPopup.requireLangPack();

        if (url = tinyMCEPopup.getParam("external_image_list_url"))
            document.write('<script language="javascript" type="text/javascript" src="' + tinyMCEPopup.editor.documentBaseURI.toAbsolute(url) + '"></script>');
    },

    init : function() {
        var f0 = document.forms[0];
        var ed = tinyMCEPopup.editor;
        var dom = ed.dom;
        var n = ed.selection.getNode();
        labels = eval(ed.getParam('labels'));

        tinyMCEPopup.resizeToInnerSize();

        // stop search on esc key
        jq('#searchtext', document).keyup(function(e) {
          if (e.keyCode == 27) { ImageDialog.checkSearch(e, true); return false; }
        });

        if (!ed.settings.allow_captioned_images) {
            jq('#caption', document).parent().parent().hide();
        }

        if (ed.settings.rooted) {
            jq('#home', document).hide();
        }

        // let's see if we are updating the image
        var n = jq(n, document);
        if (n.get(0).tagName == 'IMG') {
            var href = n.attr('src');
            if (href.indexOf('/')) {
                var href_array = href.split('/');
                var last = href_array[href_array.length-1];
                var pos = href.indexOf('@@images/image/');
                if (last.indexOf('image_') != -1) {
                    var dimensions = '@@images/image/' + href_array.pop().substring(6);
                    selectByValue(f0, 'dimensions', dimensions, true);
                    href = href_array.join ('/');
                } else if (pos != -1) {
                    var dimensions = href.substring(pos);
                    selectByValue(f0, 'dimensions', dimensions, true);
                    href = href.substring(0, pos - 1);
                }
            }
            var classnames = n.attr('class').split(' ');
            var classname = "";
            for (var i = 0; i < classnames.length; i++) {
                if (classnames[i] == 'captioned') {
                    if (ed.settings.allow_captioned_images) {
                        f0.caption.checked = true;
                    }
                } else if ((classnames[i] == 'image-inline') ||
                           (classnames[i] == 'image-left') ||
                           (classnames[i] == 'image-right')) {
                    classname = classnames[i];
                } else {
                    ImageDialog.current_class = classnames[i];
                }
            }
            selectByValue(f0, 'classes', classname, true);
            // TODO: nl2.insert.value = ed.getLang('update');

            if (href.indexOf('resolveuid') != -1) {
                var current_uid = href.split('resolveuid/')[1];
                tinymce.util.XHR.send({
                    url : ed.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                    type : 'GET',
                    success : function(text) {
                        ImageDialog.current_url = ImageDialog.getAbsoluteUrl(ed.settings.document_base_url, text);
                        if (ed.settings.link_using_uids) {
                            ImageDialog.current_link = href;
                        } else {
                            ImageDialog.current_link = ImageDialog.current_url;
                        }
                        ImageDialog.getFolderListing(ImageDialog.getParentUrl(ImageDialog.current_url), 'tinymce-jsonimagefolderlisting');
                    }
                });
            } else {
                href = this.getAbsoluteUrl(ed.settings.document_base_url, href);
                this.current_link = href;
                this.getFolderListing(this.getParentUrl(href), 'tinymce-jsonimagefolderlisting');
            }
        } else {
            this.getCurrentFolderListing();
        }

    },

    getSelectedImageUrl: function() {
        // This method provides a single entry point.

        // First, try to get the URL corresponding to the image that the user
        // selected in the center pane.
        var href = this.getRadioValue('internallink', 0);

        if (href == '') {
            // The user didn't select an image from the center pane.  So we
            // default to the URL for the thumbnail image in the right pane.
            href = ImageDialog.thumb_url;
            if (href != null) {
                href = href.substring(0, href.indexOf('/@@'));
            }
        }
        return href;
    },

    insert : function() {
        var ed = tinyMCEPopup.editor, t = this, f = document.forms[0];
        var href = t.getSelectedImageUrl();

        if (href === '') {
            if (ed.selection.getNode().nodeName == 'IMG') {
                ed.dom.remove(ed.selection.getNode());
                ed.execCommand('mceRepaint');
            }

            tinyMCEPopup.close();
            return;
        }

        t.insertAndClose();
    },

    insertAndClose : function() {
        var ed = tinyMCEPopup.editor;
        var f0 = document.forms[0];
        var nl0 = f0.elements;
        var v;
        var args = {};
        var el;

        tinyMCEPopup.restoreSelection();

        // Fixes crash in Safari
        if (tinymce.isWebKit)
            ed.getWin().focus();
            
        var href = this.getSelectedImageUrl();
        var dimensions = this.getSelectValue(f0, 'dimensions');
        if (dimensions != "") {
            href += '/' + dimensions;
        }
        args = {
            src : href,
            'class' : this.getSelectValue(f0, 'classes') +
                ((ed.settings.allow_captioned_images && f0.elements['caption'].checked) ? ' captioned' : '') +
                (ImageDialog.current_class == '' ? '' : ' ' + ImageDialog.current_class)
        };

        el = ed.selection.getNode();

        if (el && el.nodeName == 'IMG') {
            ed.dom.setAttribs(el, args);
        } else {
            ed.execCommand('mceInsertContent', false, '<img id="__mce_tmp" />', {skip_undo : 1});
            ed.dom.setAttribs('__mce_tmp', args);
            ed.dom.setAttrib('__mce_tmp', 'id','');
            ed.undoManager.add();
        }

        var description_href = jq('#description_href', document).val();
        var description = jq('#description', document).val();
        var data = "description=" + encodeURIComponent(description);
        tinymce.util.XHR.send({
            url : description_href + '/tinymce-setDescription',
            content_type : "application/x-www-form-urlencoded",
            type : "POST",
            data : data
        });

        tinyMCEPopup.close();
    },

    checkSearch : function(e, force_end) {
        var el = jq('#searchtext', document);
        if (el.val().length >= 3 && (tinyMCEPopup.editor.settings.livesearch || e.keyCode == 13)) {
            ImageDialog.is_activated_search = true;
            ImageDialog.getFolderListing(tinyMCEPopup.editor.settings.navigation_root_url, 'tinymce-jsonimagesearch');
            jq('#upload', document).attr('disabled', true);
            jq('#upload', document).fadeTo(1, 0.5);
            jq('#internalpath', document).prev().text(labels['label_search_results']);
        } 
        if (el.val().length == 0 && ImageDialog.is_activated_search || force_end) {
            el.val('');
            ImageDialog.is_activated_search = false;
            ImageDialog.getCurrentFolderListing();
            jq('#upload', document).attr('disabled', false);
            jq('#upload', document).fadeTo(1, 1);
            jq('#internalpath', document).prev().text(labels['label_internal_path']);
        }
    },

    setSwapImage : function(st) {
        var f = document.forms[0];

        f.onmousemovecheck.checked = st;
        setBrowserDisabled('overbrowser', !st);
        setBrowserDisabled('outbrowser', !st);

        if (f.over_list)
            f.over_list.disabled = !st;

        if (f.out_list)
            f.out_list.disabled = !st;

        f.onmouseoversrc.disabled = !st;
        f.onmouseoutsrc.disabled  = !st;
    },

    fillClassList : function(id) {
        var dom = tinyMCEPopup.dom, lst = dom.get(id), v, cl;

        if (v = tinyMCEPopup.getParam('theme_advanced_styles')) {
            cl = [];

            tinymce.each(v.split(';'), function(v) {
                var p = v.split('=');

                cl.push({'title' : p[0], 'class' : p[1]});
            });
        } else
            cl = tinyMCEPopup.editor.dom.getClasses();

        if (cl.length > 0) {
            lst.options[lst.options.length] = new Option(tinyMCEPopup.getLang('not_set'), '');

            tinymce.each(cl, function(o) {
                lst.options[lst.options.length] = new Option(o.title || o['class'], o['class']);
            });
        } else
            dom.remove(dom.getParent(id, 'tr'));
    },

    fillFileList : function(id, l) {
        var dom = tinyMCEPopup.dom, lst = dom.get(id), v, cl;

        l = window[l];

        if (l && l.length > 0) {
            lst.options[lst.options.length] = new Option('', '');

            tinymce.each(l, function(o) {
                lst.options[lst.options.length] = new Option(o[0], o[1]);
            });
        } else
            dom.remove(dom.getParent(id, 'tr'));
    },

    changeAppearance : function() {
        var ed = tinyMCEPopup.editor, f = document.forms[0], img = document.getElementById('alignSampleImg');

        if (img) {
            if (ed.getParam('inline_styles')) {
                ed.dom.setAttrib(img, 'style', f.style.value);
            } else {
                img.align = f.align.value;
                img.border = f.border.value;
                img.hspace = f.hspace.value;
                img.vspace = f.vspace.value;
            }
        }
    },

    changeWidth : function() {
        var f = document.forms[0], tp, t = this;

        if (!f.constrain.checked || !t.preloadImg) {
            return;
        }

        if (f.width.value == "" || f.height.value == "")
            return;

        tp = (parseInt(f.height.value) / parseInt(t.preloadImg.height)) * t.preloadImg.width;
        f.width.value = tp.toFixed(0);
    },

    changeMouseMove : function() {
    },

    setFormValue : function(name, value, formnr) {
        document.forms[formnr].elements[name].value = value;
    },
    
    getInputValue : function(name, formnr) {
        return document.forms[formnr].elements[name].value;
    },

    getRadioValue : function(name, formnr) {
        var value = "";
        var elm = document.forms[formnr][name];
        if (typeof (elm) != 'undefined') {
            if (typeof(elm.value) == 'undefined') {
                for (var i = 0; i < elm.length; i++) {
                    if (elm[i].checked) {
                        value = elm[i].value;
                    }
                }
            } else {
                if (elm.checked) {
                    value = elm.value;
                }
            }
        }

        return value;
    },

    setRadioValue : function(name, value, formnr) {
        var elm = document.forms[formnr][name];
        if (typeof (elm) != 'undefined') {
            if (typeof(elm['value']) == 'undefined') {
                for (var i = 0; i < elm.length; i++) {
                    if (elm[i].value == value) {
                        elm[i].checked = true;
                    }
                }
            } else {
                if (elm.value == value) {
                    elm.checked = true;
                }
            }
        }
    },
    
    getSelectValue : function(form_obj, field_name) {
        var elm = form_obj.elements[field_name];

        if (elm == null || elm.options == null)
            return "";

        return elm.options[elm.selectedIndex].value;
    },

    setDetails : function(path,title) {
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
        ImageDialog.thumb_url = null;

        tinymce.util.XHR.send({
            url : path + '/tinymce-jsondetails',
            type : 'POST',
            success : function(text) {
                var html = "";
                var data = eval('(' + text + ')');
                var f0 = document.forms[0];
                var elm = f0.elements['dimensions'];
                var dimension = "";
                if (elm != null && elm.options != null) {
                    dimension = elm.options[elm.selectedIndex].value;
                }

                if (data.thumb != "") {
                    document.getElementById ('previewimagecontainer').innerHTML = '<img src="' + data.thumb + '" border="0" />';
                }

                jq('#description', document).val(data.description);
                jq('#description_href', document).val(path);

                if (data.scales) {
                    var dimensions = document.getElementById('dimensions');
                    var newdimensions = [];
                    dimensions.innerHTML='';
                    for(var i=0; i<data.scales.length; i++) {
                        var nd = document.createElement('option');
                        nd.value = data.scales[i].value;
                        if (nd.value == dimension) {
                            nd.selected = true;
                        }
                        if (data.scales[i].size[0]) {
                            nd.text = data.scales[i].title+' ('+data.scales[i].size[0]+'x'+data.scales[i].size[1]+')';
                        } else {
                            nd.text = data.scales[i].title;
                        }
                        dimensions.options.add(nd);
                    }
                }
                this.current_path = path;
                ImageDialog.displayPreviewPanel();
            }
        });
    },

    getCurrentFolderListing : function() {
        this.getFolderListing(tinyMCEPopup.editor.settings.document_base_url, 'tinymce-jsonimagefolderlisting');
    },
    
    getFolderListing : function(path, method) {
        // Sends a low level Ajax request
        tinymce.util.XHR.send({
            url : path + '/' + method,
            content_type : "application/x-www-form-urlencoded",
            type : 'POST',
            data : "searchtext=" + jq('#searchtext', document).val() + "&rooted=" + (tinyMCEPopup.editor.settings.rooted ? "True" : "False") + "&document_base_url=" + encodeURIComponent(tinyMCEPopup.editor.settings.document_base_url),
            success : function(text) {
                var html = "";
                var data = eval('(' + text + ')');
                if (data.items.length == 0) {
                    html = labels['label_no_items'];
                } else {
                    for (var i = 0; i < data.items.length; i++) {
                        if (data.items[i].url == ImageDialog.current_link && tinyMCEPopup.editor.settings.link_using_uids) {
                            ImageDialog.current_link = 'resolveuid/' + data.items[i].uid;
                        }
                        if (data.items[i].is_folderish) {
                            html += '<div class="item folderish ' + (i % 2 == 0 ? 'even' : 'odd') + '">';
                            html += '<img src="img/arrow_right.png" border="0" /> ';
                            html += '<img src="' + data.items[i].icon + '" border="0" /> ';
                            html += '<a href="' + data.items[i].url + '" class="folderlink contenttype-' + data.items[i].normalized_type + '">';
                            html += data.items[i].title;
                            html += '</a>';
                        } else {
                            html += '<div class="item ' + (i % 2 == 0 ? 'even' : 'odd') + '">';
                            html += '<input onclick="ImageDialog.setDetails(\'';
                            html += data.items[i].url + '\',\'' + data.items[i].title.replace(/'/g, "\\'") + '\');"';
                            html += ' type="radio" class="noborder" style="margin: 0; width: 16px" name="internallink" value="';
                            if (tinyMCEPopup.editor.settings.link_using_uids) {
                                html += "resolveuid/" + data.items[i].uid;
                            } else {
                                html += data.items[i].url;
                            }
                            html += '"/> ';
                            html += '<img src="' + data.items[i].icon + '" border="0" /> ';
                            html += '<span class="contenttype-' + data.items[i].normalized_type + '">' + data.items[i].title + '</span>';
                        }
                        html += '</div>';
                    }
                }
                jq('#internallinkcontainer', document).html(html);

                // folder link action
                jq('#internallinkcontainer div a', document).click(function(e) {
                    e.preventDefault();
                    e.stopPropagation()
                    ImageDialog.getFolderListing(jq(this).attr('href'), 'tinymce-jsonimagefolderlisting');
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
                html = "";
                for (var i = 0; i < data.path.length; i++) {
                    if (i != 0) {
                        html += " &rarr; ";
                    }
                    html += '<img src="' + data.path[i].icon + '" border="0" /> ';
                    if (i == data.path.length - 1) {
                        html += data.path[i].title;
                    } else {
                        html += '<a href="javascript:ImageDialog.getFolderListing(\'' + data.path[i].url + '\',\'tinymce-jsonimagefolderlisting' + '\')">';
                        html += data.path[i].title;
                        html += '</a>';
                    }
                }
                jq('#internalpath', document).html(html);

                // Check if allowed to upload
                if (data.upload_allowed) {
                    jq('#upload', document).show();
                } else {
                    jq('#upload', document).hide();
                }

                // Set global path
                ImageDialog.current_path = path;
                jq('#upload_form', document).attr('action', ImageDialog.current_path + '/tinymce-upload');
                ImageDialog.setRadioValue('internallink', ImageDialog.current_link, 0);

                if (ImageDialog.current_link != "") {
                    if (ImageDialog.current_link.indexOf('resolveuid') != -1) {
                        current_uid = ImageDialog.current_link.split('resolveuid/')[1];
                        tinymce.util.XHR.send({
                            url : tinyMCEPopup.editor.settings.portal_url + '/portal_tinymce/tinymce-getpathbyuid?uid=' + current_uid,
                            type : 'GET',
                            success : function(text) {
                                ImageDialog.current_url = ImageDialog.getAbsoluteUrl(tinyMCEPopup.editor.settings.document_base_url, text);
                                ImageDialog.setDetails(ImageDialog.current_url,'');
                            }
                        });
                    } else {
                        ImageDialog.setDetails(ImageDialog.current_link,'');
                    }
                }

                // shortcuts
                if (method != 'tinymce-jsonimagesearch') {
                    jq('#internallinkcontainer', document).prepend('<div class="browser-separator"><img src="img/arrow_down.png"><strong>' + labels['label_browser'] + '</strong></div>');
                    var sh = tinyMCEPopup.editor.settings.shortcuts_html;
                    for (var i = sh.length-1; i > -1; i--) {
                        jq('#internallinkcontainer', document).prepend('<div class="item shortcut">' + sh[i] + '</div>');
                    }
                    jq('#internallinkcontainer', document).prepend('<div id="shortcuts" class="browser-separator"><img src="img/arrow_down.png"><strong>' + labels['label_shortcuts'] + '</strong></div>');
                    jq('#shortcuts', document).click(function() {
                        jq('#internallinkcontainer .shortcut', document).toggle();
                    });
                }

                // Hide all panels
                ImageDialog.hidePanels();
            }
        });
    },

    getParentUrl : function(url) {
        var url_array = url.split('/');
        url_array.pop();
        return url_array.join('/');
    },

    getAbsoluteUrl : function(base, link) {
        if ((link.indexOf('http://') != -1) || (link.indexOf('https://') != -1) || (link.indexOf('ftp://') != -1)) {
            return link;
        }
    
        var base_array = base.split('/');
        var link_array = link.split('/');
    
        // Remove document from base url
        base_array.pop();
    
        while (link_array.length != 0) {
            var item = link_array.shift();
            if (item == ".") {
                // Do nothing
            } else if (item == "..") {
                // Remove leave node from base
                base_array.pop();
            } else {
                // Push node to base_array
                base_array.push(item);
            }
        }
        return (base_array.join('/'));
    },

    displayUploadPanel : function() {
        jq('#general_panel', document).width(530);
        jq('#addimage_panel', document).removeClass('hide');
        jq('#details_panel', document).addClass("hide");
        jq('#internallinkcontainer input', document).attr('checked', false);
        jq('#upload, #insert', document).attr('disabled', true).fadeTo(1, 0.5);
        jq('#insert', document).attr('disabled', true).fadeTo(1, 0.5);
    },

    displayPreviewPanel : function() {
        jq('#general_panel', document).width(530);
        jq('#addimage_panel', document).addClass('hide');
        jq('#details_panel', document).removeClass("hide");
        jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
        jq('#insert', document).attr('disabled', false).fadeTo(1, 1);
    },
    hidePanels: function() {
        jq('#general_panel', document).width(790);
        jq('#addimage_panel', document).addClass('hide');
        jq('#details_panel', document).addClass("hide");
        jq('#upload', document).attr('disabled', false).fadeTo(1, 1);
    }

};

function uploadOk(ok_msg) {
    ImageDialog.current_link = ok_msg;
    ImageDialog.getFolderListing(ImageDialog.current_path, 'tinymce-jsonimagefolderlisting');
}

function uploadError(error_msg) {
    alert (error_msg);
}

ImageDialog.preInit();
tinyMCEPopup.onInit.add(ImageDialog.init, ImageDialog);
