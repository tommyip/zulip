var ui = (function () {

var exports = {};

var actively_scrolling = false;

exports.actively_scrolling = function () {
    return actively_scrolling;
};

// What, if anything, obscures the home tab?
exports.home_tab_obscured = function () {
    if ($('.modal:visible').length > 0) {
        return 'modal';
    }
    if (! $('#home').hasClass('active')) {
        return 'other_tab';
    }
    return false;
};

exports.change_tab_to = function (tabname) {
    $('#gear-menu a[href="' + tabname + '"]').tab('show');
};

exports.focus_on = function (field_id) {
    // Call after autocompleting on a field, to advance the focus to
    // the next input field.

    // Bootstrap's typeahead does not expose a callback for when an
    // autocomplete selection has been made, so we have to do this
    // manually.
    $("#" + field_id).focus();
};

function amount_to_paginate() {
    // Some day we might have separate versions of this function
    // for Page Up vs. Page Down, but for now it's the same
    // strategy in either direction.
    var info = viewport.message_viewport_info();
    var page_size = info.visible_height;

    // We don't want to page up a full page, because Zulip users
    // are especially worried about missing messages, so we want
    // a little bit of the old page to stay on the screen.  The
    // value chosen here is roughly 2 or 3 lines of text, but there
    // is nothing sacred about it, and somebody more anal than me
    // might wish to tie this to the size of some particular DOM
    // element.
    var overlap_amount = 55;

    var delta = page_size - overlap_amount;

    // If the user has shrunk their browser a whole lot, pagination
    // is not going to be very pleasant, but we can at least
    // ensure they go in the right direction.
    if (delta < 1) {
        delta = 1;
    }

    return delta;
}

exports.page_up_the_right_amount = function () {
    // This function's job is to scroll up the right amount,
    // after the user hits Page Up.  We do this ourselves
    // because we can't rely on the browser to account for certain
    // page elements, like the compose box, that sit in fixed
    // positions above the message pane.  For other scrolling
    // related adjustements, try to make those happen in the
    // scroll handlers, not here.
    var delta = amount_to_paginate();
    viewport.scrollTop(viewport.scrollTop() - delta);
};

exports.page_down_the_right_amount = function () {
    // see also: page_up_the_right_amount
    var delta = amount_to_paginate();
    viewport.scrollTop(viewport.scrollTop() + delta);
};

exports.replace_emoji_with_text = function (element) {
    element.find(".emoji").replaceWith(function () {
        return $(this).attr("alt");
    });
};

/* We use 'visibility' rather than 'display' and jQuery's show() / hide(),
   because we want to reserve space for the email address.  This avoids
   things jumping around slightly when the email address is shown. */

var current_message_hover;
function message_unhover() {
    var message;
    if (current_message_hover === undefined) {
        return;
    }
    message = current_msg_list.get(rows.id(current_message_hover));
    if (message && message.sent_by_me) {
        current_message_hover.find('.message_content').find('span.edit_content').remove();
    }
    current_message_hover.removeClass('message_hovered');
    current_message_hover = undefined;
}

function message_hover(message_row) {
    var message;
    var edit_content_button = '<span class="edit_content"><i class="icon-vector-pencil edit_content_button"></i></span>';
    if (current_message_hover && message_row && current_message_hover.attr("zid") === message_row.attr("zid")) {
        return;
    }
    // Don't allow on-hover editing for local-only messages
    if (message_row.hasClass('local')) {
        return;
    }
    message = current_msg_list.get(rows.id(message_row));
    message_unhover();
    message_row.addClass('message_hovered');
    if (message && message.sent_by_me && !message.status_message && !feature_flags.disable_message_editing) {
        message_row.find('.message_content').find('p:last').append(edit_content_button);
    }
    current_message_hover = message_row;
}

exports.report_message = function (response, status_box, cls) {
    if (cls === undefined) {
        cls = 'alert';
    }

    status_box.removeClass(status_classes).addClass(cls)
              .text(response).stop(true).fadeTo(0, 1);
    status_box.show();
};

exports.report_error = function (response, xhr, status_box) {
    if (xhr.status.toString().charAt(0) === "4") {
        // Only display the error response for 4XX, where we've crafted
        // a nice response.
        response += ": " + $.parseJSON(xhr.responseText).msg;
    }

    ui.report_message(response, status_box, 'alert-error');
};

exports.report_success = function (response, status_box) {
    ui.report_message(response, status_box, 'alert-success');
};

var clicking = false;
var mouse_moved = false;

function mousedown() {
    mouse_moved = false;
    clicking = true;
}

function mousemove() {
    if (clicking) {
        mouse_moved = true;
    }
}

function need_skinny_mode() {
    if (window.matchMedia !== undefined) {
        return window.matchMedia("(max-width: 767px)").matches;
    } else {
        // IE<10 doesn't support window.matchMedia, so do this
        // as best we can without it.
        return window.innerWidth <= 767;
    }
}

function update_message_in_all_views(message_id, callback) {
    _.each([all_msg_list, home_msg_list, narrowed_msg_list], function (list) {
        if (list === undefined) {
            return;
        }
        var row = list.get_row(message_id);
        if (row === undefined) {
            // The row may not exist, e.g. if you do an action on a message in
            // a narrowed view
            return;
        }
        callback(row);
    });
}

function find_message(message_id) {
    // Try to find the message object. It might be in the narrow list
    // (if it was loaded when narrowed), or only in the all_msg_list
    // (if received from the server while in a different narrow)
    var message;
    _.each([all_msg_list, home_msg_list, narrowed_msg_list], function (msg_list) {
        if (msg_list !== undefined && message === undefined) {
            message = msg_list.get(message_id);
        }
    });
    return message;
}

exports.update_starred = function (message_id, starred) {
    // Update the message object pointed to by the various message
    // lists.
    var message = find_message(message_id);

    unread.mark_message_as_read(message);

    message.starred = starred;

    // Avoid a full re-render, but update the star in each message
    // table in which it is visible.
    update_message_in_all_views(message_id, function update_row(row) {
        var elt = row.find(".message_star");
        if (starred) {
            elt.addClass("icon-vector-star").removeClass("icon-vector-star-empty").removeClass("empty-star");
        } else {
            elt.removeClass("icon-vector-star").addClass("icon-vector-star-empty").addClass("empty-star");
        }
        var title_state = message.starred ? "Unstar" : "Star";
        elt.attr("title", title_state + " this message");
    });
};

function toggle_star(message_id) {
    // Update the message object pointed to by the various message
    // lists.
    var message = find_message(message_id);

    unread.mark_message_as_read(message);
    exports.update_starred(message.id, message.starred !== true);
    message_flags.send_starred([message], message.starred);
}

var local_messages_to_show = [];
var show_message_timestamps = _.throttle(function () {
    _.each(local_messages_to_show, function (message_id) {
        update_message_in_all_views(message_id, function update_row(row) {
            row.find('.message_time').toggleClass('notvisible', false);
        });
    });
    local_messages_to_show = [];
}, 100);

exports.show_local_message_arrived = function (message_id) {
    local_messages_to_show.push(message_id);
    show_message_timestamps();
};

exports.show_message_failed = function (message_id, failed_msg) {
    // Failed to send message, so display inline retry/cancel
    update_message_in_all_views(message_id, function update_row(row) {
        var failed_div = row.find('.message_failed');
        failed_div.toggleClass('notvisible', false);
        failed_div.find('.failed_text').attr('title', failed_msg);
    });
};

exports.show_failed_message_success = function (message_id) {
    // Previously failed message succeeded
    update_message_in_all_views(message_id, function update_row(row) {
        row.find('.message_failed').toggleClass('notvisible', true);
    });
};

exports.small_avatar_url = function (message) {
    // Try to call this function in all places where we need 25px
    // avatar images, so that the browser can help
    // us avoid unnecessary network trips.  (For user-uploaded avatars,
    // the s=25 parameter is essentially ignored, but it's harmless.)
    //
    // We actually request these at s=50, so that we look better
    // on retina displays.
    if (message.avatar_url) {
        var url = message.avatar_url + "&s=50";
        if (message.sent_by_me) {
            url += "&stamp=" + settings.avatar_stamp;
        }
        return url;
    } else {
        return "";
    }
};

var loading_more_messages_indicator_showing = false;
exports.show_loading_more_messages_indicator = function () {
    if (! loading_more_messages_indicator_showing) {
        loading.make_indicator($('#loading_more_messages_indicator'),
                                    {abs_positioned: true});
        loading_more_messages_indicator_showing = true;
        floating_recipient_bar.hide();
    }
};

exports.hide_loading_more_messages_indicator = function () {
    if (loading_more_messages_indicator_showing) {
        loading.destroy_indicator($("#loading_more_messages_indicator"));
        loading_more_messages_indicator_showing = false;
    }
};

/* EXPERIMENTS */

/* This method allows an advanced user to use the console
 * to switch the application to span full width of the browser.
 */
exports.switchToFullWidth = function () {
    $("#full-width-style").remove();
    $('head').append('<style id="full-width-style" type="text/css">' +
                         '#home .alert-bar, .recipient-bar-content, #compose-container, .app-main, .header-main { max-width: none; }' +
                     '</style>');
    return ("Switched to full width");
};

/* END OF EXPERIMENTS */

$(function () {
    // NB: This just binds to current elements, and won't bind to elements
    // created after ready() is called.
    $('#send-status .send-status-close').click(
        function () { $('#send-status').stop(true).fadeOut(500); }
    );

    var throttled_mousewheelhandler = $.throttle(50, function (e, delta) {
        // Most of the mouse wheel's work will be handled by the
        // scroll handler, but when we're at the top or bottom of the
        // page, the pointer may still need to move.

        if (delta > 0) {
            if (viewport.at_top()) {
                navigate.up();
            }
        } else if (delta < 0) {
            if (viewport.at_bottom()) {
                navigate.down();
            }
        }

        last_viewport_movement_direction = delta;
    });

    viewport.message_pane.mousewheel(function (e, delta) {
        // Ignore mousewheel events if a modal is visible.  It's weird if the
        // user can scroll the main view by wheeling over the greyed-out area.
        // Similarly, ignore events on settings page etc.
        //
        // We don't handle the compose box here, because it *should* work to
        // select the compose box and then wheel over the message stream.
        var obscured = exports.home_tab_obscured();
        if (!obscured) {
            throttled_mousewheelhandler(e, delta);
        } else if (obscured === 'modal') {
            // The modal itself has a handler invoked before this one (see below).
            // preventDefault here so that the tab behind the modal doesn't scroll.
            //
            // This needs to include the events that would be ignored by throttling.
            // That's why this code can't be moved into throttled_mousewheelhandler.
            e.preventDefault();
        }
        // If on another tab, we neither handle the event nor preventDefault, allowing
        // the tab to scroll normally.
    });

    $(window).resize($.throttle(50, resize.handler));

    // Scrolling in modals, input boxes, and other elements that
    // explicitly scroll should not scroll the main view.  Stop
    // propagation in all cases.  Also, ignore the event if the
    // element is already at the top or bottom.  Otherwise we get a
    // new scroll event on the parent (?).
    $('.modal-body, .scrolling_list, input, textarea').mousewheel(function (e, delta) {
        var self = $(this);
        var scroll = self.scrollTop();

        // The -1 fudge factor is important here due to rounding errors.  Better
        // to err on the side of not scrolling.
        var max_scroll = this.scrollHeight - self.innerHeight() - 1;

        e.stopPropagation();
        if (   ((delta > 0) && (scroll <= 0))
            || ((delta < 0) && (scroll >= max_scroll))) {
            e.preventDefault();
        }
    });

    // Ignore wheel events in the compose area which weren't already handled above.
    $('#compose').mousewheel(function (e) {
        e.stopPropagation();
        e.preventDefault();
    });

    // A little hackish, because it doesn't seem to totally get us the
    // exact right width for the floating_recipient_bar and compose
    // box, but, close enough for now.
    resize.handler();

    if (!feature_flags.left_side_userlist) {
        $("#navbar-buttons").addClass("right-userlist");
    }

    function is_clickable_message_element(target) {
        return target.is("a") || target.is("img.message_inline_image") || target.is("img.twitter-avatar") ||
            target.is("div.message_length_controller") || target.is("textarea") || target.is("input") ||
            target.is("i.edit_content_button");
    }

    $("#main_div").on("click", ".messagebox", function (e) {
        if (is_clickable_message_element($(e.target))) {
            // If this click came from a hyperlink, don't trigger the
            // reply action.  The simple way of doing this is simply
            // to call e.stopPropagation() from within the link's
            // click handler.
            //
            // Unfortunately, on Firefox, this breaks Ctrl-click and
            // Shift-click, because those are (apparently) implemented
            // by adding an event listener on link clicks, and
            // stopPropagation prevents them from being called.
            return;
        }
        if (!(clicking && mouse_moved)) {
            // Was a click (not a click-and-drag).
            var row = $(this).closest(".message_row");
            var id = rows.id(row);

            if (message_edit.is_editing(id)) {
                // Clicks on a message being edited shouldn't trigger a reply.
                return;
            }

            current_msg_list.select_id(id);
            respond_to_message({trigger: 'message click'});
            e.stopPropagation();
            popovers.hide_all();
        }
        mouse_moved = false;
        clicking = false;
    });

    $("#main_div").on("mousedown", ".messagebox", mousedown);
    $("#main_div").on("mousemove", ".messagebox", mousemove);
    $("#main_div").on("mouseover", ".message_row", function (e) {
        var row = $(this).closest(".message_row");
        message_hover(row);
    });

    $("#main_div").on("mouseleave", ".message_row", function (e) {
        message_unhover();
    });

    $("#main_div").on("mouseover", ".message_sender", function (e) {
        var row = $(this).closest(".message_row");
        row.addClass("sender_name_hovered");
    });

    $("#main_div").on("mouseout", ".message_sender", function (e) {
        var row = $(this).closest(".message_row");
        row.removeClass("sender_name_hovered");
    });

    $("#main_div").on("click", ".star", function (e) {
        e.stopPropagation();
        popovers.hide_all();
        toggle_star(rows.id($(this).closest(".message_row")));
    });

    function get_row_id_for_narrowing(narrow_link_elem) {
        var group = rows.get_closest_group(narrow_link_elem);
        var msg_id = rows.id_for_recipient_row(group);

        var nearest = current_msg_list.get(msg_id);
        var selected = current_msg_list.selected_message();
        if (util.same_recipient(nearest, selected)) {
            return selected.id;
        } else {
            return nearest.id;
        }
    }

    $("#home").on("click", ".narrows_by_recipient", function (e) {
        if (e.metaKey || e.ctrlKey) {
            return;
        }
        e.preventDefault();
        var row_id = get_row_id_for_narrowing(this);
        narrow.by_recipient(row_id, {trigger: 'message header'});
    });

    $("#home").on("click", ".narrows_by_subject", function (e) {
        if (e.metaKey || e.ctrlKey) {
            return;
        }
        e.preventDefault();
        var row_id = get_row_id_for_narrowing(this);
        narrow.by_subject(row_id, {trigger: 'message header'});
    });

    $("#userlist-toggle-button").on("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        var sidebarHidden = !$(".app-main .column-right").hasClass("expanded");
        popovers.hide_all();
        if (sidebarHidden) {
            popovers.show_userlist_sidebar();
        }
    });

    $("#streamlist-toggle-button").on("click", function (e) {
        e.preventDefault();
        e.stopPropagation();

        var sidebarHidden = !$(".app-main .column-left").hasClass("expanded");
        popovers.hide_all();
        if (sidebarHidden) {
            popovers.show_streamlist_sidebar();
        }
    });

    $("#subscriptions_table").on("mouseover", ".subscription_header", function (e) {
        $(this).addClass("active");
    });

    $("#subscriptions_table").on("mouseout", ".subscription_header", function (e) {
        $(this).removeClass("active");
    });

    $("#stream").on('blur', function () { compose.decorate_stream_bar(this.value); });

    // Capture both the left-sidebar Home click and the tab breadcrumb Home
    $(document).on('click', "li[data-name='home']", function (e) {
        ui.change_tab_to('#home');
        narrow.deactivate();
        // We need to maybe scroll to the selected message
        // once we have the proper viewport set up
        setTimeout(maybe_scroll_to_selected, 0);
        e.preventDefault();
    });

    $(".brand").on('click', function (e) {
        if (exports.home_tab_obscured()) {
            ui.change_tab_to('#home');
        } else {
            narrow.restore_home_state();
        }
        maybe_scroll_to_selected();
        e.preventDefault();
    });

    $(window).on('blur', function () {
        $(document.body).addClass('window_blurred');
    });

    $(window).on('focus', function () {
        $(document.body).removeClass('window_blurred');
    });

    $(document).on('message_selected.zulip', function (event) {
        if (current_msg_list !== event.msg_list) {
            return;
        }
        if (event.id === -1) {
            // If the message list is empty, don't do anything
            return;
        }
        var row = event.msg_list.get_row(event.id);
        $('.selected_message').removeClass('selected_message');
        row.addClass('selected_message');

        if (event.then_scroll) {
            if (row.length === 0) {
                var row_from_dom = current_msg_list.get_row(event.id);
                blueslip.debug("message_selected missing selected row", {
                    previously_selected: event.previously_selected,
                    selected_id: event.id,
                    selected_idx: event.msg_list.selected_idx(),
                    selected_idx_exact: event.msg_list._items.indexOf(event.msg_list.get(event.id)),
                    render_start: event.msg_list.view._render_win_start,
                    render_end: event.msg_list.view._render_win_end,
                    selected_id_from_idx: event.msg_list._items[event.msg_list.selected_idx()].id,
                    msg_list_sorted: _.isEqual(
                        _.pluck(event.msg_list._items, 'id'),
                        _.chain(current_msg_list._items).pluck('id').clone().value().sort()
                    ),
                    found_in_dom: row_from_dom.length
                });
            }
            if (event.target_scroll_offset !== undefined) {
                viewport.set_message_offset(event.target_scroll_offset);
            } else {
                // Scroll to place the message within the current view;
                // but if this is the initial placement of the pointer,
                // just place it in the very center
                recenter_view(row, {from_scroll: event.from_scroll,
                                    force_center: event.previously_selected === -1});
            }
        }
    });

    $("#main_div").on("mouseenter", ".message_time", function (e) {
        var time_elem = $(e.target);
        var row = time_elem.closest(".message_row");
        var message = current_msg_list.get(rows.id(row));
        timerender.set_full_datetime(message, time_elem);
    });

    $('#user_presences').expectOne().on('click', '.selectable_sidebar_block', function (e) {
        var email = $(e.target).parents('li').attr('data-email');
        narrow.by('pm-with', email, {select_first_unread: true, trigger: 'sidebar'});
        // The preventDefault is necessary so that clicking the
        // link doesn't jump us to the top of the page.
        e.preventDefault();
        // The stopPropagation is necessary so that we don't
        // see the following sequence of events:
        // 1. This click "opens" the composebox
        // 2. This event propagates to the body, which says "oh, hey, the
        //    composebox is open and you clicked out of it, you must want to
        //    stop composing!"
        e.stopPropagation();
        // Since we're stopping propagation we have to manually close any
        // open popovers.
        popovers.hide_all();
    });

    $('#group-pms').expectOne().on('click', '.selectable_sidebar_block', function (e) {
        var emails = $(e.target).parents('li').attr('data-emails');
        narrow.by('pm-with', emails, {select_first_unread: true, trigger: 'sidebar'});
        e.preventDefault();
        e.stopPropagation();
        popovers.hide_all();
    });

    $('#streams_inline_cog').tooltip({ placement: 'left',
                                       animation: false });

    $('#streams_header a').click(function (e) {
        exports.change_tab_to('#subscriptions');

        e.preventDefault();
    });

    popovers.register_click_handlers();
    notifications.register_click_handlers();

    $('.compose_stream_button').click(function (e) {
        compose.start('stream');
    });
    $('.compose_private_button').click(function (e) {
        compose.start('private');
    });

    $('.empty_feed_compose_stream').click(function (e) {
        compose.start('stream', {trigger: 'empty feed message'});
        e.preventDefault();
    });
    $('.empty_feed_compose_private').click(function (e) {
        compose.start('private', {trigger: 'empty feed message'});
        e.preventDefault();
    });
    $('.empty_feed_join').click(function (e) {
        subs.show_and_focus_on_narrow();
        e.preventDefault();
    });

    // Keep these 2 feedback bot triggers separate because they have to
    // propagate the event differently.
    $('.feedback').click(function (e) {
        compose.start('private', { 'private_message_recipient': 'feedback@zulip.com',
                                   trigger: 'feedback menu item' });

    });
    $('#feedback_button').click(function (e) {
        e.stopPropagation();
        popovers.hide_all();
        compose.start('private', { 'private_message_recipient': 'feedback@zulip.com',
                                   trigger: 'feedback button' });

    });
    $('.logout_button').click(function (e) {
        $('#logout_form').submit();
    });
    $('.restart_get_events_button').click(function (e) {
        server_events.restart_get_events({dont_block: true});
    });

    $('body').on('click', '.edit_content_button', function (e) {
        var row = current_msg_list.get_row(rows.id($(this).closest(".message_row")));
        current_msg_list.select_id(rows.id(row));
        message_edit.start(row);
        e.stopPropagation();
        popovers.hide_all();
    });
    $('body').on('click','.always_visible_topic_edit,.on_hover_topic_edit', function (e) {
        var recipient_row = $(this).closest(".recipient_row");
        message_edit.start_topic_edit(recipient_row);
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".topic_edit_save", function (e) {
        var recipient_row = $(this).closest(".recipient_row");
        if (message_edit.save(recipient_row) === true) {
            current_msg_list.hide_edit_topic(recipient_row);
        }
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".topic_edit_cancel", function (e) {
        var recipient_row = $(this).closest(".recipient_row");
        current_msg_list.hide_edit_topic(recipient_row);
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".message_edit_save", function (e) {
        var row = $(this).closest(".message_row");
        if (message_edit.save(row) === true) {
            // Re-fetch the message row in case .save() re-rendered the message list
            message_edit.end($(this).closest(".message_row"));
        }
        e.stopPropagation();
        popovers.hide_all();
    });
    $("body").on("click", ".message_edit_cancel", function (e) {
        var row = $(this).closest(".message_row");
        message_edit.end(row);
        e.stopPropagation();
        popovers.hide_all();
    });

    // Webathena integration code
    $('#right-sidebar, #top_navbar').on('click', '.webathena_login', function (e) {
        $("#zephyr-mirror-error").hide();
        var principal = ["zephyr", "zephyr"];
        WinChan.open({
            url: "https://webathena.mit.edu/#!request_ticket_v1",
            relay_url: "https://webathena.mit.edu/relay.html",
            params: {
                realm: "ATHENA.MIT.EDU",
                principal: principal
            }
        }, function (err, r) {
            if (err) {
                blueslip.warn(err);
                return;
            }
            if (r.status !== "OK") {
                blueslip.warn(r);
                return;
            }

            channel.post({
                url:      "/accounts/webathena_kerberos_login/",
                data:     {cred: JSON.stringify(r.session)},
                success: function (data, success) {
                    $("#zephyr-mirror-error").hide();
                },
                error: function (data, success) {
                    $("#zephyr-mirror-error").show();
                }
            });
        });
        $('#settings-dropdown').dropdown("toggle");
        e.preventDefault();
        e.stopPropagation();
    });
    // End Webathena code

    $(document).on('click', function (e) {
        if (e.button !== 0) {
            // Firefox emits right click events on the document, but not on
            // the child nodes, so the #compose stopPropagation doesn't get a
            // chance to capture right clicks.
            return;
        }

        // Dismiss popovers if the user has clicked outside them
        if ($('.popover-inner').has(e.target).length === 0) {
            popovers.hide_all();
        }

        // Unfocus our compose area if we click out of it. Don't let exits out
        // of modals or selecting text (for copy+paste) trigger cancelling.
        if (compose.composing() && !$(e.target).is("a") &&
            ($(e.target).closest(".modal").length === 0) &&
            window.getSelection().toString() === "") {
            compose.cancel();
        }
    });

    function handle_compose_click(e) {
        // Don't let clicks in the compose area count as
        // "unfocusing" our compose -- in other words, e.g.
        // clicking "Press enter to send" should not
        // trigger the composebox-closing code above.
        // But do allow our formatting link.
        if (!$(e.target).is("a")) {
            e.stopPropagation();
        }
        // Still hide the popovers, however
        popovers.hide_all();
    }

    $("#compose_buttons").click(handle_compose_click);
    $(".compose-content").click(handle_compose_click);

    $("#compose_close").click(function (e) {
        compose.cancel();
    });

    $(".bankruptcy_button").click(function (e) {
        unread.enable();
    });

    $('#yes-bankrupt').click(function (e) {
        fast_forward_pointer();
        $("#yes-bankrupt").hide();
        $("#no-bankrupt").hide();
        $(this).after($("<div>").addClass("alert alert-info settings_committed")
               .text("Bringing you to your latest messages…"));
    });

    if (feature_flags.disable_message_editing) {
        $("#edit-message-hotkey-help").hide();
    }

    // Some MIT-specific customizations
    if (page_params.domain === 'mit.edu') {
        $("#user-list").hide();
        $("#group-pm-list").hide();
    }

    if (feature_flags.full_width) {
        exports.switchToFullWidth();
    }

    // initialize other stuff
    reload.initialize();
    composebox_typeahead.initialize();
    search.initialize();
    notifications.initialize();
    hashchange.initialize();
    invite.initialize();
    activity.initialize();
    tutorial.initialize();
});


var scroll_start_message;

function scroll_finished() {
    actively_scrolling = false;

    if ($('#home').hasClass('active')) {
        if (!suppress_scroll_pointer_update) {
            keep_pointer_in_view();
        } else {
            suppress_scroll_pointer_update = false;
        }
        floating_recipient_bar.update();
        if (viewport.scrollTop() === 0 &&
            have_scrolled_away_from_top) {
            have_scrolled_away_from_top = false;
            message_store.load_more_messages(current_msg_list);
        } else if (!have_scrolled_away_from_top) {
            have_scrolled_away_from_top = true;
        }
        // When the window scrolls, it may cause some messages to
        // enter the screen and become read.  Calling
        // unread.process_visible will update necessary
        // data structures and DOM elements.
        setTimeout(unread.process_visible, 0);
    }
}

var scroll_timer;
function scroll_finish() {
    actively_scrolling = true;
    clearTimeout(scroll_timer);
    scroll_timer = setTimeout(scroll_finished, 100);
}

// Save the compose content cursor position and restore when we
// shift-tab back in (see hotkey.js).
var saved_compose_cursor = 0;

$(function () {
    viewport.message_pane.scroll($.throttle(50, function (e) {
        unread.process_visible();
        scroll_finish();
    }));

    $('#new_message_content').blur(function () {
        saved_compose_cursor = $(this).caret().start;
    });
});

exports.restore_compose_cursor = function () {
    // Restore as both the start and end point, i.e.
    // nothing selected.
    $('#new_message_content')
        .focus()
        .caret(saved_compose_cursor, saved_compose_cursor);
};
$(function () {
    // Workaround for Bootstrap issue #5900, which basically makes dropdowns
    // unclickable on mobile devices.
    // https://github.com/twitter/bootstrap/issues/5900
    $('a.dropdown-toggle, .dropdown-menu a').on('touchstart', function (e) {
        e.stopPropagation();
    });
});

$(function () {
    if (window.bridge !== undefined) {
        // Disable "spellchecking" in our desktop app. The "spellchecking"
        // in our Mac app is actually autocorrect, and frustrates our
        // users.
        $("#new_message_content").attr('spellcheck', 'false');
        // Modify the zephyr mirroring error message in our desktop
        // app, since it doesn't work from the desktop version.
        $("#webathena_login_menu").hide();
        $("#normal-zephyr-mirror-error-text").addClass("notdisplayed");
        $("#desktop-zephyr-mirror-error-text").removeClass("notdisplayed");
    }
});



return exports;
}());
