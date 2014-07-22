/* XDATA Twitter Geomap application
 *
 * Developed by Kitware & KnowledgeVis
 * Software released under Apache 2 Open Source License
 *
 * update history:
 * 3/6/2014 - added additional logging options for Draper logging facility. Logging is disabled by default
 * 3/6/2014 - Updated to use Tangelo v1.0
 *
 */

/*jslint browser:true, unparam:true */

/*globals tangelo, twitter_geomap, $, google, d3, date, console */

var twitter_geomap = {};
twitter_geomap.map = null;
twitter_geomap.timeslider = null;
twitter_geomap.users = null;

// query logging
// set this to true for testing mode of logging.  false for production mode (testmode=false actually sends logs)
twitter_geomap.testMode = true;
twitter_geomap.echoLogsToConsole = false

// reset the user list on a new time range query
twitter_geomap.resetUserList = function () {
    twitter_geomap.users = {
        array: [],
        obj: {}
    };
    $('#user').autocomplete({ source: [] });
};

// update the user list from a mongo response
twitter_geomap.updateUserList = function (data) {

    var that = twitter_geomap;
    that.resetUserList();

    // Collect a list of all users and sort by the number of tweets.
    var users = that.users.obj,
        userArray = that.users.array,
        user;
    data.forEach(function (d) {
        if (users[d.user] === undefined) {
            users[d.user] = 1;
        } else {
            users[d.user] += 1;
        }
    });
    for (user in users) {
        if (users.hasOwnProperty(user)) {
            userArray.push({
                user: user,
                count: users[user]
            });
        }
    }
    userArray = userArray.sort(function (a, b) {
        return b.count - a.count;
    }).map(
        function (d) { return d.user; }
    );

    // Update the user filter selection box
    $('#user').autocomplete({ source: function (request, response) {
        var results = $.ui.autocomplete.filter(userArray, request.term);
        response(results.slice(0, 10));
    }});
};

// keep track of how many entities are actually on the screen
twitter_geomap.markerCount = 0;



// announce to the console which mode the app is in
if (twitter_geomap.testMode)
    console.log("Geomap: Testing mode. No logs will be sent");
else
    console.log("Geomap: Production mode.  Logging is enabled");

// create to logging sending endpoint.  Note that echo=true means echo messages to console.  testing=true means no
// messages are actually sent.  This allows easy debugging during local testing. Set testing=false to attempt
// actual connections and logs sent to the logging server

twitter_geomap.ac = new activityLogger().echo(twitter_geomap.echoLogsToConsole).testing(twitter_geomap.testMode).mute(['SYS']);
//twitter_geomap.ac.registerActivityLogger("http://xd-draper.xdata.data-tactics-corp.com:1337", "Kitware_Twitter_GeoBrowser", "3.0");
twitter_geomap.ac.registerActivityLogger("http://10.1.90.46:1337", "Kitware_Twitter_GeoBrowser", "3.01");


twitter_geomap.config = null;
twitter_geomap.locationData = null;

twitter_geomap.dayColor = d3.scale.category10();
twitter_geomap.monthColor = d3.scale.category20();

twitter_geomap.dayName = d3.time.format("%a");
twitter_geomap.monthName = d3.time.format("%b");
twitter_geomap.dateformat = d3.time.format("%a %b %e, %Y (%H:%M:%S)");

twitter_geomap.monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
];

twitter_geomap.dayNames = [
    "Sun",
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat"
];


twitter_geomap.getMongoDBInfo = function () {
    "use strict";

    // Read in the config options regarding which MongoDB
    // server/database/collection to use. Hardcode to reduce chance for errors during demonstrations.
    return {
        server: 'localhost',
        db:  'year2',
        coll:  'twitter_sa'

    };
};

twitter_geomap.getMongoRange = function (host, db, coll, field, callback) {
    "use strict";

    var min,
        max,
        mongourl;

    // The base URL for both of the mongo service queries.
    mongourl = "/service/mongo/" + host + "/" + db + "/" + coll;

    // Fire an ajax call to retrieve the maxmimum value.
    $.ajax({
        url: mongourl,
        data: {
            sort: JSON.stringify([[field, -1]]),
            limit: 1,
            fields: JSON.stringify([field])
        },
        dataType: "json",
        success: function (response) {
            // If the value could not be retrieved, set it to null and print
            // an error message on the console.
            if (response.error || response.result.data.length === 0) {
                max = null;

                if (response.error) {
                    tangelo.fatalError("twiter-geomap.getMongoRange()", "error: could not retrieve max value from " + host + ":/" + db + "/" + coll + ":" + field);
                }
            } else {
                max = response.result.data[0][field];
            }

            // Fire a second query to retrieve the minimum value.
            $.ajax({
                url: mongourl,
                data: {
                    sort: JSON.stringify([[field, 1]]),
                    limit: 1,
                    fields: JSON.stringify([field])
                },
                dataType: "json",
                success: function (response) {
                    // As before, set the min value to null if it could not
                    // be retrieved.
                    if (response.error || response.result.data.length === 0) {
                        min = null;

                        if (response.error) {
                            tangelo.fatalError("twitter-geomap.getMongoRange()", "could not retrieve min value from " + host + ":/" + db + "/" + coll + ":" + field);
                        }
                    } else {
                        min = response.result.data[0][field];
                    }

                    // Pass the range to the user callback.
                    callback(min, max);
                }
            });
        }
    });
};


function showConfig() {
    "use strict";

    var cfg;

    cfg = twitter_geomap.getMongoDBInfo();
    d3.select("#mongodb-server").property("value", cfg.server);
    d3.select("#mongodb-db").property("value", cfg.db);
    d3.select("#mongodb-coll").property("value", cfg.coll);
}

function updateConfig() {
    "use strict";

    var server,
        db,
        coll;

    // Grab the elements.
    server = document.getElementById("mongodb-server");
    db = document.getElementById("mongodb-db");
    coll = document.getElementById("mongodb-coll");

    // Write the options into DOM storage.
    localStorage.setItem('twitter_geomap:mongodb-server', server.value);
    localStorage.setItem('twitter_geomap:mongodb-db', db.value);
    localStorage.setItem('twitter_geomap:mongodb-coll', coll.value);
}

function setConfigDefaults() {
    "use strict";

    var cfg;

    // Clear out the locally stored options.
    localStorage.removeItem('twitter_geomap:mongodb-server');
    localStorage.removeItem('twitter_geomap:mongodb-db');
    localStorage.removeItem('twitter_geomap:mongodb-coll');

    // Retrieve the new config values, and set them into the fields.
    cfg = twitter_geomap.getMongoDBInfo();
    d3.select("#mongodb-server").property("value", cfg.server);
    d3.select("#mongodb-db").property("value", cfg.db);
    d3.select("#mongodb-coll").property("value", cfg.coll);
}

function retrieveData(saveUserList) {
    "use strict";

    var times,
        timequery,
        hashtagText,
        hashtags,
        hashtagquery,
        query,
        mongo;

    // Interrogate the UI elements to build up a query object for the database.
    //
    // Get the time slider range.
    times = twitter_geomap.timeslider.slider("values");

    // Construct a query that selects times between the two ends of the slider.
    timequery = {
        $and : [{'date' : {$gte : {"$date" : times[0]}}},
                {'date' : {$lte : {"$date" : times[1]}}}]
    };

    // Get the hashtag text and split it into several tags.
    hashtagText = d3.select("#user").node().value;
    hashtags = [];
    if (hashtagText !== "") {
        hashtags = hashtagText.split(/\s+/);
    }

    // Construct a query to find any entry containing any of these tags.
    hashtagquery = {};
    if (hashtags.length > 0) {
        hashtagquery = { 'user' : {$in : hashtags}};
    }

    // add force to return only entries with 'mentioned'==true
    var mentionedquery = {'mentioned':true};

    // Get the current map bounds.
    var bounds = twitter_geomap.map.map.getBounds();
    var boundsquery = {
        location: {
            $geoWithin: {
                $box: [[bounds.getSouthWest().lng(), bounds.getSouthWest().lat()],
                       [bounds.getNorthEast().lng(), bounds.getNorthEast().lat()]]
            }
        }
    };

    // Stitch all the queries together into a "superquery".
    query = {$and : [timequery, hashtagquery, mentionedquery, boundsquery]};
    var querystring = JSON.stringify(query)
    twitter_geomap.ac.logUserActivity("User performed new query: "+querystring, "query", twitter_geomap.ac.WF_GETDATA);

    // Enable the abort button and issue the query to the mongo module.
    mongo = twitter_geomap.getMongoDBInfo();
    d3.select("#abort")
        .classed("btn-success", false)
        .classed("btn-danger", true)
        .classed("disabled", false)
        .html("Abort query <i class=\"icon-repeat icon-white spinning\"></i>");

    twitter_geomap.currentAjax = $.ajax({
        type: 'POST',
        url: '/service/mongo/' + mongo.server + '/' + mongo.db + '/' + mongo.coll,
        data: {
            query: JSON.stringify(query),
            limit: d3.select("#record-limit").node().value,
            sort: JSON.stringify([['randomNumber', 1]])
        },
        dataType: 'json',
        success: function (response) {
            var N,
                data;

            // Remove the stored XHR object.
            twitter_geomap.currentAjax = null;

            // Error check.
            if (response.error) {
                console.log("fatal error: " + response.error);
                d3.select("#abort")
                    .classed("btn-success", false)
                    .classed("btn-danger", true)
                    .classed("disabled", true)
                    .html("error: " + response.error);
                return;
            }

            // sort the results by date
            response.result.data = response.result.data.sort(function (a, b) {
                return a.date.$date - b.date.$date;
            });

            // Indicate success, display the number of records, and disable the
            // button.
            N = response.result.data.length;
            d3.select("#abort")
                .classed("btn-danger", false)
                .classed("btn-success", true)
                .classed("disabled", true)
                .text("Got " + N + " result" + (N === 0 || N > 1 ? "s" : ""));

            // Process the data returned

            var i,j;
            var thisTweet;
            var locs;
            var occurrences = [];
            var thisOccurrence;
            for (i=0;i<N;i++) {
                thisTweet = response.result.data[i]
                var date = new Date(thisTweet.date.$date);
                var dateShortString = twitter_geomap.dateformat(date);
                thisTweet.month = twitter_geomap.monthName(date);
                thisTweet.day = twitter_geomap.dayName(date);

                if (thisTweet.location) {
                    //console.log("found: ",thisTweet.user," date: ",thisTweet.date," loc: [",thisTweet.location[1],", ",thisTweet.location[0],"]");

                   // reformat the data so there is an array entry for each browsing occurrence point
                   // with the appropriate metadata loaded into the overlay.  This is
                   // so d3 select operations can operate on the array for rendering individual
                   // circles for each occurrence point.

                        thisOccurrence = {
                                user: thisTweet.user,
                                dateShortString: dateShortString,
                                date: date,
                                month: thisTweet.month,
                                day: thisTweet.day,
                                contents: thisTweet.contents,
                                location: thisTweet.location,
                                _id: thisTweet._id
                                };
                        //console.log(thisOccurrence)
                        occurrences.push(thisOccurrence);
                };
            };

            // Store the retrieved values in the map object.
            twitter_geomap.map.locations(occurrences);
            if (!saveUserList) {
                twitter_geomap.updateUserList(occurrences);
            }

            // Redraw the map.
            twitter_geomap.map.draw();
        }
    });
}

function getMinMaxDates(zoom) {
    "use strict";

    var mongo;

    mongo = twitter_geomap.getMongoDBInfo();

    // Get the earliest and latest times in the collection, and set the slider
    // range/handles appropriately.
    twitter_geomap.getMongoRange(mongo.server, mongo.db, mongo.coll, "date", function (min, max) {
        // Retrieve the timestamps from the records.
        min = min.$date;
        max = max.$date;

        // Set the min and max of the time slider.
        twitter_geomap.timeslider.slider("option", "min", min);
        twitter_geomap.timeslider.slider("option", "max", max);

        // Set the low slider handle to July 30 (for a good initial setting to
        // investigate the data), and the high handle to the max.
        twitter_geomap.timeslider.slider("values", 0, Date.parse("Jul 30, 2012 01:31:06"));
        twitter_geomap.timeslider.slider("values", 1, max);

        // Zoom the slider to this range, if requested.
        if (zoom) {
            zoom(twitter_geomap.timeslider);
        }

        // Finally, retrieve the initial data to bootstrap the
        // application.
        retrieveData();

        // Add the 'retrieveData' behavior to the slider's onchange
        // callback (which starts out ONLY doing the 'displayFunc'
        // part).
        twitter_geomap.timeslider.slider("option", "change", function (evt, ui) {
            var low,
                high;

            low = ui.values[0];
            high = ui.values[1];

            twitter_geomap.displayFunc(low, high);
            retrieveData();
        });
    });
}

function retrieveDataSynthetic() {
    "use strict";

    var chicago,
        paris,
        slc,
        albany,
        dhaka,
        rio,
        wellington,
        locs;

    // Generate a few lat/long values in well-known places.
    chicago = [42.0, -87.5];
    paris = [48.9, 2.3];
    slc = [40.8, -111.9];
    albany = [42.7, -73.8];
    dhaka = [23.7, 90.4];
    rio = [-22.9, -43.2];
    wellington = [-41.3, 174.8];

    // Take the array of arrays, and map it to an array of google LatLng
    // objects.
    locs = [chicago, paris, slc, albany, dhaka, rio, wellington].map(function (d) { return new google.maps.LatLng(d[0], d[1]); });

    // Store the retrieved values.
    twitter_geomap.map.locations(locs);

    // After data is reloaded to the map-overlay object, redraw the map.
    twitter_geomap.map.draw();
}

function GMap(elem, options) {
    "use strict";

    var that;

    // Create the map object and place it into the specified container element.
    this.map = new google.maps.Map(elem, options);

    // Record the container element.
    this.container = elem;

    // Create an empty data array.
    this.locationData = [];

    // Store a null 'overlay' property, which will be filled in with a
    // transparent SVG element when the overlay is sized and placed in the
    // draw() callback.
    this.overlay = null;

    this.dayColor = d3.scale.category10();
    this.monthColor = d3.scale.category20();

    this.setMap(this.map);

    that = this;
    google.maps.event.addListener(this.map, "drag", function () { that.draw(); });
    google.maps.event.addListener(this.map, "dragstart", function () { mapDraggedListener(that,"start"); });
    google.maps.event.addListener(this.map, "dragend", function () { mapDraggedListener(that,"end"); });
    google.maps.event.addListener(this.map, "bounds_changed", function () { boundsChangedListener(that) });
    google.maps.event.addListener(this.map, "zoom_changed", function () { zoomChangedListener(that) });
}


// declaration of a map listener that sends a log message whenever the map is dragged. The Google API is used to
// return the current lat,long of the displayed extent to pass to the logger.  The number of currently displayed entities is
// also included in the log message.

function zoomChangedListener(thisWithMap,action) {
    //console.log("detected zoom change")
    twitter_geomap.ac.logUserActivity("map zoom changed", "zoom",twitter_geomap.ac.WF_EXPLORE);
}


// declaration of a map listener that sends a log message whenever the map is dragged. The Google API is used to
// return the current lat,long of the displayed extent to pass to the logger.  The number of currently displayed entities is
// also included in the log message.

function mapDraggedListener(thisWithMap,action) {
    //console.log("map drag: "+action)
    twitter_geomap.ac.logUserActivity("map drag: "+action, "pan-"+action, twitter_geomap.ac.WF_EXPLORE);
}

// declaration of a map listener that sends a log message whenever the map extent is changed. The Google API is used to
// return the current lat,long of the displayed extent to pass to the logger.  The number of currently displayed entities is
// also included in the log message.

function boundsChangedListener(thisWithMap) {
        //console.log("detected bounds change")
        if (thisWithMap.locationData) {
            proj = thisWithMap.getProjection();
            w = thisWithMap.container.offsetWidth;
            h = thisWithMap.container.offsetHeight;
            containerTopLeftLatLng = proj.fromContainerPixelToLatLng({x: 0, y: 0});
            containerBottomRightLatLng = proj.fromContainerPixelToLatLng({x: w, y: h});
            //console.log("bounds: ",containerTopLeftLatLng,containerBottomRightLatLng);
            boundaryString = "[{"+containerTopLeftLatLng.k+","+containerTopLeftLatLng.A+"}, {"+containerBottomRightLatLng.k+","+containerBottomRightLatLng.A+"}]"
            // defeated the number displayed, because it tracked the query, not the actual number displayed because of the way
            // a single SVG contains all entities
            //numEntitiesDisplayed = twitter_geomap.markerCount
            //console.log("markers",numEntitiesDisplayed)
            //twitter_geomap.ac.logUserActivity("map bounds: "+boundaryString+" displayCount: "+numEntitiesDisplayed, "bounds_changed", twitter_geomap.ac.WF_EXPLORE);
            twitter_geomap.ac.logSystemActivity("map bounds: "+boundaryString, "bounds_changed", twitter_geomap.ac.WF_EXPLORE);

        }
}


// This function is attached to the hover event for displayed d3 entities.  This means each rendered tweet has
// a logger installed so if a hover event occurs, a log of the user's visit to this entity is sent to the activity log

function loggedVisitToEntry(d) {
        //console.log("mouseover of entry for ",d.user)
        twitter_geomap.ac.logUserActivity("hover over entity: "+d.user, "hover", twitter_geomap.ac.WF_EXPLORE);
}


// called when window is constructed and ready for the first rendering
function firstTimeInitializeMap() {
    "use strict";

        var options,
            div,
            buttons,
            i,
            checkbox,
            dayboxes,
            popover_cfg,
            zoomfunc,
            redraw;

        setConfigDefaults();

        // Create control panel.
        $("#control-panel").controlPanel();

        twitter_geomap.timeslider = $("#time-slider");

        // Enable the popover help items.
        //
        // First create a config object with the common options preset.
        popover_cfg = {
            html: true,
            container: "body",
            placement: "top",
            trigger: "hover",
            title: null,
            content: null,
            delay: {
                show: 100,
                hide: 100
            }
        };

        // Time slider help.
        popover_cfg.title = "Time Filtering";
        popover_cfg.content = "Display tweets generated between two particular dates/times.<br><br>" +
            "The 'zoom to range' button will make the slider represent the currently selected time slice, " +
            "while the 'unzoom' button undoes one zoom.";
        $("#time-filter-help").popover(popover_cfg);

        // Hashtag help.
        popover_cfg.title = "Username Filtering";
        popover_cfg.content = "Display tweets generated by the user specified.";
        $("#username-filter-help").popover(popover_cfg);

        // TODO(choudhury): Probably the GMap prototype extension stuff should all
        // go in its own .js file.
        //
        // Equip ourselves with the overlay prototype.
        GMap.prototype = new google.maps.OverlayView();

        // Implement the callbacks for controlling the overlay.
        //
        // onAdd() signals that the map's panes are ready to receive the overlaid
        // DOM element.
        GMap.prototype.onAdd = function () {
            console.log("onAdd()!");

            // Grab the overlay mouse target element (because it can accept, e.g.,
            // mouse hover events to show SVG tooltips), wrap it in a D3 selection,
            // and add the SVG element to it.
            this.overlayLayer = this.getPanes().overlayMouseTarget;

            var svg = d3.select(this.overlayLayer).append("div")
                .attr("id", "svgcontainer")
                .style("position", "relative")
                .style("left", "0px")
                .style("top", "0px")
                .append("svg");

            // Add a debugging rectangle.
            //svg.append("rect")
                //.attr("id", "debugrect")
                //.style("fill-opacity", 0.4)
                //.style("fill", "white")
                //.style("stroke", "black")
                //.attr("width", svg.attr("width"))
                //.attr("height", svg.attr("height"));

            svg.append("g")
                .attr("id", "markers");

            // Record the SVG element in the object for later use.
            this.overlay = svg.node();

            // Add an SVG element to the map's div to serve as a color legend.
            svg = d3.select(this.map.getDiv())
                .append("svg")
                .style("position", "fixed")
                .style("top", "100px")
                .style("right", "0px")
                .attr("width", 100)
                .attr("height", 570);


            // Add an SVG group whose contents will change or disappear based on the
            // active colormap.
            this.legend = svg.append("g").node();
        };

        // draw() sizes and places the overlaid SVG element.
        GMap.prototype.draw = function () {
            var proj,
                w,
                h,
                containerLatLng,
                divPixels,
                div,
                newLeft,
                newTop,
                svg,
                data,
                days,
                N,
                that,
                color,
                radius,
                opacity,
                markers;


            // Get the transformation from lat/long to pixel coordinates - the
            // lat/long data will be "pushed through" it just prior to being drawn.
            // It is deferred this way to deal with changes in the window size,
            // etc., that can occur without warning.
            proj = this.getProjection();
            //console.log("projection: ",proj);

            // If proj is undefined, the map has not yet been initialized, so return
            // right away.
            if (proj === undefined) {
                return;
            }

            // Shift the container div to cover the "whole world".
            //
            // First, compute the pixel coordinates of the bounds of the "whole
            // world".
            proj = this.getProjection();
            w = this.container.offsetWidth;
            h = this.container.offsetHeight;
            containerLatLng = proj.fromContainerPixelToLatLng({x: 0, y: 0});
            divPixels = proj.fromLatLngToDivPixel(containerLatLng);


            // Move and resize the div element.
            div = d3.select(this.overlayLayer).select("#svgcontainer");
            newLeft = divPixels.x + "px";
            newTop = divPixels.y + "px";
            div.style("left", newLeft)
                .style("top", newTop)
                .style("width", w + "px")
                .style("height", h + "px");

            // Resize the SVG element to fit the viewport.
            svg = d3.select(this.overlayLayer).select("svg");
            svg.attr("width", w)
                .attr("height", h);


            // Process the data by adjoining pixel locations to each entry.
            data = this.locationData.map(function (d) {
                d.pixelLocation = proj.fromLatLngToDivPixel(new google.maps.LatLng(d.location[1], d.location[0]));
                d.pixelLocation.x -= divPixels.x;
                d.pixelLocation.y -= divPixels.y;
                //console.log(d.pixelLocation);
                return d;
            });

            // Filter the results by day (if any of the boxes is checked).
            days = twitter_geomap.dayNames.filter(function (d) {
                return document.getElementById(d).checked;
            });
            if (days.length > 0) {
                data = data.filter(function (d) {
                    return days.indexOf(d.day) !== -1;
                });
            }

            // Grab the total number of data items.
            N = data.length;

            // Select a colormapping function based on the radio buttons.
            that = this;
            color = (function () {
                var which,
                    colormap,
                    legend,
                    retval,
                    invert,
                    range,
                    scale;

                // Determine which radio button is currently selected.
                which = $("input[name=colormap]:radio:checked").attr("id");

                // Generate a colormap function to return, and place a color legend
                // based on it.
                if (which === 'month') {
                    colormap = function (d) {
                        return twitter_geomap.monthColor(d.month);
                    };

                    $(that.legend).svgColorLegend({
                        cmap_func: twitter_geomap.monthColor,
                        xoffset: 10,
                        yoffset: 10,
                        categories: twitter_geomap.monthNames,
                        height_padding: 5,
                        width_padding: 7,
                        text_spacing: 19,
                        legend_margins: {
                            top: 5,
                            left: 5,
                            bottom: 5,
                            right: 5
                        },
                        clear: true
                    });

                    retval = colormap;
                } else if (which === 'day') {
                    colormap = function (d) {
                        return twitter_geomap.dayColor(d.day);
                    };

                    $(that.legend).svgColorLegend({
                        cmap_func: twitter_geomap.dayColor,
                        xoffset: 10,
                        yoffset: 10,
                        categories: twitter_geomap.dayNames,
                        height_padding: 5,
                        width_padding: 7,
                        text_spacing: 19,
                        legend_margins: {top: 5, left: 5, bottom: 5, right: 5},
                        clear: true
                    });

                    retval = colormap;
                } else if (which === 'rb') {
                    d3.select(that.legend).selectAll("*").remove();
                    range = ['white', 'red'] ;
                    scale = d3.scale.linear()
                        .domain([0, N - 1])
                        .range(range);

                    retval = function (d, i) {
                        return scale(i);
                    };
                }  else if (which === 'invert') {
                    d3.select(that.legend).selectAll("*").remove();

                    range =  ['red', 'white'];
                    scale = d3.scale.linear()
                        .domain([0, N - 1])
                        .range(range);

                    retval = function (d, i) {
                        return scale(i);
                    };
                } else {
                    d3.select(that.legend).selectAll("*").remove();
                    retval = "pink";
                }

                return retval;
            }());

            // Select a radius function as well.
            radius = (function () {
                var which,
                    retval,
                    size;

                // Determine which radio button is selected.
                which = $("input[name=size]:radio:checked").attr("id");

                // Generate a radius function to return.
                if (which === 'recency') {
                    retval = function (d, i) {
                        return 5 + 15 * (N - 1 - i) / (N - 1);
                    };
                } else {
                    // Get the size value.
                    size = parseFloat(d3.select("#size").node().value);
                    if (isNaN(size) || size <= 0.0) {
                        size = 5.0;
                    }

                    retval = size;
                }

                return retval;
            }());

            // Get the opacity value.
            opacity = twitter_geomap.opacityslider.slider("value") / 100;
            //opacity = 0.5

            // Compute a data join with the current list of marker locations, using
            // the MongoDB unique id value as the key function.
            //
            /*jslint nomen: true */
            markers = d3.select(this.overlay)
                .select("#markers")
                .selectAll("circle")
                .data(data, function (d) {

                // CRL - this was a deep bug.  The d3 data join was messed up.  It turns out the twitter ingest 
                // script in the twitter app from year1 mapped tweet IDs to mongo IDs, which is dangerous.
                // Later processing scripts allow mongo to assign IDs, so use mongo IDs if they exist, 
                // otherwise look for the original dataset with long numbers (and no $oid field):

                   if (typeof d._id.$oid != 'undefined') {
                        return d._id.$oid;
                    } else {
                        return d._id;
                    }
                });
            /*jslint nomen: false */

            // For the enter selection, create new circle elements, and attach a
            // title element to each one.  In the update selection (which includes
            // the newly added circles), set the proper location and fade in new
            // elements.  Fade out circles in the exit selection.
            //
            // TODO(choudhury): the radius of the marker should depend on the zoom
            // level - smaller circles at lower zoom levels.
            markers.enter()
                .append("circle")
                .style("opacity", 0.0)
                .style("cursor", "crosshair")
                .attr("r", 0)
                .each(function (d) {
                    var cfg,
                        msg,
                        date;

                    date = new Date(d.date.$date);

                    msg = "";
                    msg += "<b>Date:</b> " + d.dateShortString + "<br>\n";
                    msg += "<b>Location:</b> (" + d.location[1] + ", " + d.location[0] + ")<br>\n";
                    msg += "<b>Author:</b> " + d.user + "<br>\n";
                    msg += "<b>Content:</b> " + d.contents + "<br>\n";

                    cfg = {
                        html: true,
                        container: "body",
                        placement: "top",
                        trigger: "hover",
                        content: msg,
                        delay: {
                            show: 0,
                            hide: 0
                        }
                    };
                    $(this).popover(cfg);
                })
                .on("mouseover", function(d) {
                    loggedVisitToEntry(d)
                })
           	.on("click", function(d) {
                    selectEntryToExamine(d);
                    var userSelector = document.getElementById("user");
		    userSelector.value = d.user;
		    retrieveData();		   
                })
                .each( function (d) {
                    twitter_geomap.markerCount = twitter_geomap.markerCount+1
                });

            // This is to prevent division by zero if there is only one data
            // element.
            if (N === 1) {
                N = 2;
            }
            markers
                .attr("cx", function (d) {
                    return d.pixelLocation.x;
                })
                .attr("cy", function (d) {
                    return d.pixelLocation.y;
                })
                .style("fill", color)
                //.style("fill-opacity", 0.6)
                .style("fill-opacity", 1.0)
                .style("stroke", "black")
                .transition()
                .duration(500)
                //.attr("r", function(d, i) { return 5 + 15*(N-1-i)/(N-1); })
                .attr("r", radius)
                //.style("opacity", 1.0);
                .style("opacity", opacity);
                //.style("opacity", function(d, i){ return 0.3 + 0.7*i/(N-1); });

            markers.exit()
                .transition()
                .duration(500)
                .style("opacity", 0.0)
                .each( function (d) {
                    twitter_geomap.markerCount = twitter_geomap.markerCount-1
                })
                .remove();

        };  // end of GMap.prototype.draw()

        // onRemove() destroys the overlay when it is no longer needed.
        GMap.prototype.onRemove = function () {
            // TODO(choudhury): implement this function by removing the SVG element
            // from the pane.
            console.log("onRemove()!");

        };

        GMap.prototype.locations = function (locationData) {
            // TODO(choudhury): it might be better to actually copy the values here.
            //
            this.locationData = locationData;
            //this.locationData = []
            //this.locationData.length = 0;
            //for(var i=0; i<locationData.length; i++){
                //this.locationData.push(locationData[i]);
            //}
        };

        // This function is used to display the current state of the time slider.
        twitter_geomap.displayFunc = (function () {
            var lowdiv,
                highdiv;

            lowdiv = d3.select("#low");
            highdiv = d3.select("#high");

            return function (low, high) {
                lowdiv.html(twitter_geomap.dateformat(new Date(low)));
                highdiv.html(twitter_geomap.dateformat(new Date(high)));
            };
        }());

        // Create a range slider for slicing by time.  Whenever the slider changes
        // or moves, update the display showing the current time range.  Eventually,
        // the "onchange" callback (which fires when the user releases the mouse
        // button when making a change to the slider position) will also trigger a
        // database lookup, but at the moment we omit that functionality to avoid
        // spurious database lookups as the engine puts the slider together and sets
        // the positions of the sliders programmatically.
        twitter_geomap.timeslider.slider({
            range: true,

            change: function (evt, ui) {
                var low,
                    high;

                low = ui.values[0];
                high = ui.values[1];

                twitter_geomap.displayFunc(low, high);
            },

            slide: function (evt, ui) {
                var low,
                    high;

                low = ui.values[0];
                high = ui.values[1];

                twitter_geomap.displayFunc(low, high);
            }
        });

        // Some options for initializing the google map.
        //
        // Set to Middle East
        options = {
            zoom: 6,
            //center: new google.maps.LatLng(8.86, 30.33),
            center: new google.maps.LatLng(8,-68),
            //mapTypeId: google.maps.MapTypeId.ROADMAP
            mapTypeId: google.maps.MapTypeId.TERRAIN

        };
        div = d3.select("#map").node();
        twitter_geomap.map = new GMap(div, options);

        // Direct the colormap selector radio buttons to redraw the map when they
        // are clicked.
        buttons = document.getElementsByName("colormap");
        redraw = function () {
            twitter_geomap.map.draw();
            twitter_geomap.ac.logUserActivity("changed colormap selection", "redrawing", twitter_geomap.ac.WF_EXPLORE);
        };

        for (i = 0; i < buttons.length; i += 1) {
            buttons[i].onclick = redraw;
        }
        checkbox = document.getElementById("invert");
        checkbox.onclick = function () {
            twitter_geomap.map.draw();
            twitter_geomap.ac.logUserActivity("color map inverted", "color map change", twitter_geomap.ac.WF_EXPLORE);
        };

        var dayboxesredraw = function () {
            twitter_geomap.map.draw();
            twitter_geomap.ac.logUserActivity("changed day name selection", "day selection change", twitter_geomap.ac.WF_EXPLORE);
        };

        // Direct the day filter checkboxes to redraw the map when clicked.
        dayboxes = twitter_geomap.dayNames.map(function (d) {
            return document.getElementById(d);
        });

        for (i = 0; i < dayboxes.length; i += 1) {
            dayboxes[i].onclick = dayboxesredraw;
        }

        var glyphsizeredraw = function () {
            twitter_geomap.map.draw();
            twitter_geomap.ac.logUserActivity("changed glyph size", "glyphsize change redraw", twitter_geomap.ac.WF_EXPLORE);
        };


        // Direct the glyph size radio buttons to redraw.
        buttons = document.getElementsByName("size");
        for (i = 0; i < buttons.length; i += 1) {
            buttons[i].onclick = glyphsizeredraw;
        }

        // Direct the size control to redraw.
        document.getElementById("size").onchange = glyphsizeredraw;

       var opacityredraw = function () {
            twitter_geomap.map.draw();
            twitter_geomap.ac.logUserActivity("changed glyph opacity", "opacity change redraw", twitter_geomap.ac.WF_EXPLORE);
        };


        // Create a regular slider for setting the opacity and direct it to redraw
        // when it changes (but not on every slide action - that would be bulky and
        // too slow; the UI doesn't demand that level of responsivity).
        twitter_geomap.opacityslider = $("#opacity");
        twitter_geomap.opacityslider.slider({
            min: 0,
            max: 100,
            value: 100,
            change: opacityredraw
        });

        // event handlers to log the action and then cause a screen redraw.

        var onUserNameChange = function () {
                var userSelector = document.getElementById("user")
                console.log("user filter change:",userSelector.value)
                twitter_geomap.ac.logUserActivity("user changed to: "+userSelector.value, "userChange", twitter_geomap.ac.WF_EXPLORE);
                retrieveData();//;userSelector !== '');
        };

        var onRecordLimitChange = function () {
                var limitSelector = document.getElementById("record-limit")
                console.log("new record limit:",limitSelector.value)
                twitter_geomap.ac.logUserActivity("record limit changed to: "+limitSelector.value, "recordLimit", twitter_geomap.ac.WF_EXPLORE);
                retrieveData();
        };

        // The database lookup should happen again when the hashtag list or record
        // count limit field changes.
        $('#user').autocomplete({
            change: onUserNameChange,
            minLength: 0
        }).keyup(function (evt) {
            // respond to enter by starting a query
            if (evt.which === 13) {
                onUserNameChange();
            }
        });
        d3.select("#record-limit").node().onchange = onRecordLimitChange;

        // Attach actions to the zoom and unzoom buttons.
        zoomfunc = (function () {
            var unzoom,
                stack;

            unzoom = d3.select("#unzoom");

            stack = [];

            return {
                zoomer: function (slider) {
                    var value,
                        bounds;

                    twitter_geomap.ac.logUserActivity("zoom timescale in - time slider", "zoom-time-in", twitter_geomap.ac.WF_CREATE);

                    // Return immediately if the handles are already at the bounds.
                    //value = slider.getValue();
                    value = slider.slider("values");
                    //bounds = [slider.getMin(), slider.getMax()];
                    bounds = [slider.slider("option", "min"), slider.slider("option", "max")];
                    if (value[0] === bounds[0] && value[1] === bounds[1]) {
                        return;
                    }

                    // Save the current bounds on the stack.
                    stack.push(bounds);

                    // Set the bounds of the slider to be its current value range.
                    //slider.setMin(value[0]);
                    slider.slider("option", "min", value[0]);
                    slider.slider("option", "max", value[1]);

                    // Activate the unzoom button if this is the first entry in the
                    // stack.
                    if (stack.length === 1) {
                        unzoom.classed("disabled", false);
                    }
                },

                unzoomer: function (slider) {
                    var bounds;

                    twitter_geomap.ac.logUserActivity("zoom timescale out - time slider", "zoom-time-out", twitter_geomap.ac.WF_CREATE);

                    // Make sure this function is not being called when there are no
                    // entries in the stack.
                    if (stack.length === 0) {
                        throw "Logic error: Unzoom button was clicked even though there is nothing to unzoom to.";
                    }

                    // Pop a bounds value from the stack, and set it as the bounds
                    // for the slider.
                    bounds = stack.pop();
                    //slider.setMin(bounds[0]);
                    slider.slider("option", "min", bounds[0]);
                    //slider.setMax(bounds[1]);
                    slider.slider("option", "max", bounds[1]);

                    // If the stack now contains no entries, disable the unzoom
                    // button.
                    if (stack.length === 0) {
                        unzoom.classed("disabled", true);
                    }
                }
            };
        }());

        d3.select("#zoom")
            .data([twitter_geomap.timeslider])
            .on('click', zoomfunc.zoomer);

	// when user clicks the button below the user input field, clear
	// the value and redraw the map so all user's tweets are displayed.
	d3.select("#clearUser")
	    .on('click', function() {
			var userSelector = document.getElementById("user");
			userSelector.value = "";
			retrieveData();
		});

        d3.select("#unzoom")
            .data([twitter_geomap.timeslider])
            .on('click', zoomfunc.unzoomer);

        // Get the earliest and latest times in the database, to create a suitable
        // range for the time slider.  Pass in the "zoomer" function so the initial
        // range can be properly zoomed to begin with.
        getMinMaxDates(zoomfunc.zoomer);

        // Install the abort action on the button.
        d3.select("#abort")
            .on("click", function () {
                twitter_geomap.ac.logUserActivity("User Clicked Query/Abort Button", "query button", twitter_geomap.ac.WF_GETDATA);

                // If there is a current ajax call in flight, abort it (it is
                // theoretically possible that the abort button is clicked between
                // the time it's activated, and the time an ajax call is sent).
                if (twitter_geomap.currentAjax) {
                    twitter_geomap.currentAjax.abort();
                    twitter_geomap.currentAjax = null;
                    twitter_geomap.ac.logUserActivity("Active query aborted", "query abort", twitter_geomap.ac.WF_GETDATA);

                    // Place a message in the abort button.
                    d3.select("#abort")
                        .classed("disabled", true)
                        .text("Query aborted");
                }

                // Disable the button.
                d3.select("#abort").classed("disabled", true);
            });
    };


// added to integrate with OWF.  The window.onload call now checks if OWF is present and 
// initializes a listener if it is present.  A listener is required because other widgets 
// will set the bounds this app should use to render. 

// this function is the top-level function invoked every time a message
// is received on the OWF message bus.  The messages received 

var processEchoMessage = function(sender, msg) {
        console.log("geomap received message:",msg)
};

var processCenterMessage = function(sender, msg) {
        console.log("geomap processing center");
	var newCenter = {lat: parseFloat(msg.lat), lng: parseFloat(msg.lon)}
	twitter_geomap.map.map.setZoom(8)
	twitter_geomap.map.map.setCenter(newCenter)
	twitter_geomap.map.update()
};
 
var processBoundsMessage = function(sender, msg) {
	console.log("geomap processing bounds");
	var sw = {lat: parseFloat(JSON.parse(msg).bounds.southWest.lat),
		  lng: parseFloat(JSON.parse(msg).bounds.southWest.lon)}
	var ne = {lat: parseFloat(JSON.parse(msg).bounds.northEast.lat), 
		  lng: parseFloat(JSON.parse(msg).bounds.northEast.lon)}
	var swLatLng = new google.maps.LatLng(sw.lat,sw.lng)
	var neLatLng = new google.maps.LatLng(ne.lat,ne.lng)
	var bounds = new google.maps.LatLngBounds()
	bounds.extend(swLatLng)
	bounds.extend(neLatLng)
	twitter_geomap.map.map.fitBounds(bounds)
	twitter_geomap.map.draw()
};

// this routine issues an OWF bus message with the same of the entity that was clicked on
function selectEntryToExamine(item) {
	var selectionList = [item.user]
	console.log("geomap selection:",selectionList)
	OWF.Eventing.publish("entity.selection",selectionList)
}

function setupOWFListener() {
   console.log("subscribing as listener");
   OWF.Eventing.subscribe('kw.echo', this.processEchoMessage);
   OWF.Eventing.subscribe('map.view.center.bounds', this.processBoundsMessage);
   OWF.Eventing.subscribe('kw.map.center', this.processCenterMessage);
}

// Ozone provides a way to test for an active session
owfdojo.addOnLoad(function() {

    	if (OWF.Util.isRunningInOWF()) {
		OWF.ready(setupOWFListener);
    	}
   	firstTimeInitializeMap()
 
});

