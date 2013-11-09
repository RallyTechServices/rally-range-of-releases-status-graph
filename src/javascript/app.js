Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',

    range_start: null,
    range_end: null,
    
    logger: new Rally.technicalservices.logger(),
    items: [
        {xtype:'container',itemId:'header_box',items:[
            {xtype:'container',itemId:'selector_box',margin: 5, layout:{type:'hbox'}},
            {xtype:'container',itemId:'summary_box',margin: 5, layout: {type:'hbox'}}
        ]},
        {xtype:'container',itemId:'chart_box' },
        {xtype:'tsinfolink'}
    ],
    launch: function() {
        this._addSummary();
    },
    _addSummary: function() {
        var selector_box = this.down('#selector_box');
        var summary_box = this.down('#summary_box');
        var me = this;
        
        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox_start',
            fieldLabel:'Beginning with: ',
            labelWidth:75,
            width:250,
            margin: 5,
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    if ( this._validateReleaseChoices() ) {
                        this._getReleases();
                    }
                },
                ready: function(rb) {
                    if ( this._validateReleaseChoices() ) {
                        this._getReleases();
                    }
                }
            }
        });

        selector_box.add({
            xtype:'rallyreleasecombobox',
            itemId:'releasebox_end',
            fieldLabel:'Ending with: ',
            labelWidth:65,
            width:250,
            margin: 5,
            listeners: {
                scope: this,
                change: function(rb, new_value, old_value) {
                    if ( this._validateReleaseChoices() ) {
                        this._getReleases();
                    }
                },
                ready: function(rb) {
                    if ( this._validateReleaseChoices() ) {
                        this._getReleases();
                    }
                }
            }
        });
        
        summary_box.add({
            xtype:'container',
            itemId:'summary',
            tpl: "<table class='summary'><tr>" +
                "<td class='summary'>Total Planned US Points: <b>{total_story_estimate}</b></td>" +
                "<td class='summary'>Accepted US Points: <b>{total_accepted_story_estimate}</b></td>" +
                "<td class='summary'>Total DE Points: <b>{total_defect_estimate}</b></td>" +
                "<td class='summary'>Accepted DE Points: <b>{total_accepted_defect_estimate}</b></td>" +
                "</tr></table>",
            data: { }
        });
    },
    _validateReleaseChoices: function() {
        this.logger.log("_validateReleaseChoices");
        this.down('#chart_box').removeAll();
        this._asynch_return_flags = {};

        var start_release_date = -1;
        var end_release_date = -2;

        var start_box = this.down('#releasebox_start')
        if ( start_box && start_box.getRecord() ) { start_release_date = start_box.getRecord().get('ReleaseStartDate'); }
        
        var end_box   = this.down('#releasebox_end');
        if ( end_box && end_box.getRecord() ) { end_release_date = end_box.getRecord().get('ReleaseDate'); }
                
        if ( start_release_date < end_release_date ) {
            this.range_start = start_release_date;
            this.range_end = end_release_date;
            return true;
        }
        
        this.down('#chart_box').add({xtype:'container',padding: 15, html:'Second release must end after the first release starts.'});
        return false;
    },
    _defineReleaseQuery:function() {
        this.logger.log("_defineReleaseQuery");
        var start_date_iso = Rally.util.DateTime.toIsoString(this.range_start, true);
        var end_date_iso = Rally.util.DateTime.toIsoString(this.range_end, true);

        // All releases inside the release dates:
        var release_query = Ext.create('Rally.data.QueryFilter',{ 
                property: "ReleaseStartDate", operator:">=", value: start_date_iso 
            }).and( Ext.create('Rally.data.QueryFilter',{
                property: "ReleaseDate", operator:"<=", value: end_date_iso
            })
        );        
        
        this.logger.log("Releases that match",release_query.toString());
        return release_query;
    },
    _getReleases: function() {
        var me = this;
        me.logger.log("_getReleases");
        this.down('#header_box').getEl().mask("Finding Items in Releases ...");

        this.release_hash = {};
        this.anti_release = Ext.create('TSRelease',{"Name":"Other"});
        
        if ( this.down('#summary') ) { this.down('#summary').update({}); }
//        
        Ext.create('Rally.data.WsapiDataStore',{
            model:'Release',
            autoLoad:true,
            limit:'Infinity',
            context: {projectScopeDown:false,projectScopeUp:false},
            filters:me._defineReleaseQuery(),
            sorters:[{property:'ReleaseStartDate'}],
            fetch:['Name','ReleaseDate','ReleaseStartDate'],
            listeners:{
                scope:this,
                load:function(store,releases,success){
                    if ( releases.length == 0 ) {
                        this.down('#chart_box').add({
                            xtype:'container',
                            html:'There are no releases in that range',
                            padding: 10
                        });
                    } else {
                        Ext.Array.each(releases,function(release){
                            var release_object = Ext.create('TSRelease',{});
                            release_object.set('release',release);
                            
                            me.release_hash[release.get('Name')] = release_object;
                            
                            me._asynch_return_flags[release.get('Name')] = true;
                            me._getReleaseData(release.get('Name'));
                        });
                    }
                }
            }
        });
    },

    _getReleaseData: function(release_name) {
        var me = this;
        me.logger.log("_getReleaseData",release_name);
        var filters = [
            {property:'PlanEstimate',operator:'>',value:0},
            {property:'Release.Name',value:release_name}
        ];
        
        var fetch = ['PlanEstimate','ScheduleState','Release','Name'];
//        
        Ext.create('Rally.data.WsapiDataStore',{
            autoLoad: true,
            limit:'Infinity',
            model: 'UserStory',
            filters: filters,
            fetch:fetch,
            listeners: {
                scope: this,
                load: function(store,stories){
                    Ext.Array.each(stories,function(story){
                        var release = me.anti_release;
                        if ( story.get('Release') && me.release_hash[story.get('Release').Name]) {
                            release = me.release_hash[story.get('Release').Name];
                        }
                        release.add('total_story_estimate',story.get('PlanEstimate'));
                    });
                    Ext.create('Rally.data.WsapiDataStore',{
                        autoLoad: true,
                        limit:'Infinity',
                        model:'Defect',
                        filters:filters,
                        fetch:fetch,
                        listeners:{
                            scope: this,
                            load: function(store,defects){
                                Ext.Array.each(defects,function(defect){
                                    var release = me.anti_release;
                                    if ( defect.get('Release') && me.release_hash[defect.get('Release').Name]) {
                                        release = me.release_hash[defect.get('Release').Name];
                                    }
                                    release.add('total_defect_estimate',defect.get('PlanEstimate'));
                                });
                                
                                me._getAcceptedReleaseData(release_name);
                            }
                        }
                    })
                }
            }
        });
    },
    /*
     * Easier than finding out at the top whether there's a state
     * AFTER accepted, have to go get all the points that are from
     * schedule states > Completed
     */
    _getAcceptedReleaseData: function(release_name) {
        var me = this;
        me.logger.log("_getAcceptedReleaseData",release_name);
        var filters = [
            {property:'PlanEstimate',operator:'>',value:0},
            {property:'ScheduleState',operator:'>',value:'Completed'},
            {property:'Release.Name',value:release_name}
        ];
        var fetch = ['PlanEstimate','ScheduleState','Release','Name','ReleaseStartDate','ReleaseDate'];
        
        Ext.create('Rally.data.WsapiDataStore',{
            autoLoad: true,
            limit:'Infinity',
            model: 'UserStory',
            filters: filters,
            fetch:fetch,
            listeners: {
                scope: this,
                load: function(store,stories){
                    Ext.Array.each(stories,function(story){
                        var release = me.anti_release;
                        if ( story.get('Release') && me.release_hash[story.get('Release').Name]) {
                            release = me.release_hash[story.get('Release').Name];
                        }
                        
                        release.add('total_accepted_story_estimate',story.get('PlanEstimate'));
                    });
                    Ext.create('Rally.data.WsapiDataStore',{
                        autoLoad: true,
                        limit:'Infinity',
                        model:'Defect',
                        filters:filters,
                        fetch:fetch,
                        listeners:{
                            scope: this,
                            load: function(store,defects){
                                Ext.Array.each(defects,function(defect){
                                    var release = me.anti_release;
                                    if ( defect.get('Release') && me.release_hash[defect.get('Release').Name]) {
                                        release = me.release_hash[defect.get('Release').Name];
                                    }
                                    release.add('total_accepted_defect_estimate',defect.get('PlanEstimate'));
                                });
                                delete this._asynch_return_flags[release_name];
                                me._prepareChartData();
                            }
                        }
                    })
                }
            }
        });

    },
    _allAsynchronousCallsReturned: function() {
        this.logger.log("Still waiting for:", this._asynch_return_flags);
        return ( Ext.Object.getKeys(this._asynch_return_flags).length == 0 );
    },
    _setCurrentReleaseIndex: function(data){
        this.logger.log("_setCurrentReleaseIndex",data);
        var me = this;
        
        var counter = 0;
        
        Ext.Object.each(this.release_hash, function(name,release){
            var today = new Date();
            
            if ( today > release.get('start_date') && today < release.get('end_date') ) {
                me.logger.log("Found current release at index:",counter);
                data.current_release_index = counter;
            }
            counter += 1;
        });
        
        return data;
    },
    // returns -1 if there aren't any non-zero releases
    _getMeanVelocity: function(data){
        var average = -1;
        
        var release_index = data.current_release_index;
        
        if (release_index > -1) {
            var all_velocities = Ext.Array.slice(data.accepted_by_release,1,release_index+1);
            this.logger.log("All velocities",all_velocities);
            // remove zeroes
            var nonzero_velocities = [];
            Ext.Array.each(all_velocities,function(velocity){
                if (velocity > 0) { nonzero_velocities.push(velocity); }
            });
            
            var last_three_nonzero_velocities = Ext.Array.slice(nonzero_velocities,-3);
            this.logger.log("Last three nonzero velocities",last_three_nonzero_velocities);
            
            if ( last_three_nonzero_velocities.length > 0 ) {
                average = Ext.Array.mean(last_three_nonzero_velocities);
            }
        }
        
        return average;
    },
    _prepareChartData: function() {
        this.logger.log("_prepareChartData");
        
        var chart_data = {
            categories: [""],
            accepted_by_release: [null],
            total_by_release: [0],
            ideal_by_release: [],
            ideal_by_release_by_initial: [],
            projected_by_release: [null],
            current_release_index: -1
        };
        if (this._allAsynchronousCallsReturned()){
            var me = this;
            this.logger.log("release_hash",me.release_hash, me.initial_estimate);
            var totals = {
                total_accepted_story_estimate:me.anti_release.get('total_accepted_story_estimate'),
                total_accepted_defect_estimate:me.anti_release.get('total_accepted_defect_estimate'),
                total_story_estimate:me.anti_release.get('total_story_estimate'),
                total_defect_estimate:me.anti_release.get('total_defect_estimate'),
                total_estimate:me.anti_release.get('total_estimate')
            };
            var accepted_running_total = 0;
            
            Ext.Object.each(this.release_hash, function(name,release){
                me.logger.log("release",name);
                chart_data.categories.push(name);
                var release_total = release.get('total_accepted_story_estimate');
                release_total += release.get('total_accepted_defect_estimate');
                chart_data.accepted_by_release.push(release_total);
                
                accepted_running_total += release_total;
                chart_data.total_by_release.push(accepted_running_total);
                chart_data.projected_by_release.push(null);
                
                // update summary data
                Ext.Object.each(totals, function(key,value){
                    totals[key] += release.get(key);
                });
                
            });
            
            this.down('#summary').update(totals);
            this._setCurrentReleaseIndex(chart_data);
            // null out accepted for future releases
            if ( chart_data.current_release_index > -1 ) {
                var release_index = chart_data.current_release_index;
                for ( var i=release_index+1;i<chart_data.total_by_release.length; i++ ) {
                    chart_data.total_by_release[i] = null;
                }
                var mean_velocity = this._getMeanVelocity(chart_data);
                if ( mean_velocity > 0 ) {
                    this.logger.log("mean",mean_velocity);
                    var projected = chart_data.total_by_release[release_index];
                    for ( var i=release_index;i<chart_data.total_by_release.length;i++ ) {
                        chart_data.projected_by_release[i] = projected;
                        projected += mean_velocity;
                    }
                    this.logger.log("projected",chart_data.projected_by_release);
                }
            }
            
            
            // make ideal line for current scope
            if ( totals.total_estimate > 0 && chart_data.total_by_release.length > 1 ) {
                var ideal_per_release = totals.total_estimate / ( chart_data.total_by_release.length - 1 );
                var running_ideal = 0;
                Ext.Array.each(chart_data.total_by_release,function(counter){
                    chart_data.ideal_by_release.push(running_ideal);
                    running_ideal += ideal_per_release;
                });
            }
            // make ideal line for initial scope
            var running_ideal = 0;
            var ideal_by_release_by_initial = 0;
            if ( this.initial_estimate > 0 && chart_data.total_by_release.length > 1 ) {
                ideal_by_release_by_initial = this.initial_estimate / ( chart_data.total_by_release.length - 1 );
            }
            Ext.Array.each(chart_data.total_by_release,function(counter){
                chart_data.ideal_by_release_by_initial.push(running_ideal);
                running_ideal += ideal_by_release_by_initial;
            });
            
            this._makeChart(chart_data);
        }
    },
    _makeChart: function(chart_data){
        this.logger.log("_makeChart",chart_data);
        this.down('#chart_box').removeAll();
        
        var series = [
        { 
            type: 'column',
            data:chart_data.accepted_by_release,
            visible: true,
            name: 'Accepted US/DE Pts'
        },
        {
            type:'line',
            data:chart_data.total_by_release,
            visible: true,
            name: 'Total Accepted US/DE Pts'
        },
        {
            type:'line',
            data:chart_data.ideal_by_release,
            visible: true,
            name: 'Total Planned US/DE Pts'
        
        }];
//        if ( SHOW_INITIAL ) {
//            series.push({
//                type:'line',
//                data:chart_data.ideal_by_release_by_initial,
//                visible: true,
//                name: 'Initial Planned US/DE Pts'
//            });
//        }
        
        if ( chart_data.current_release_index > 0 ) {
            series.push({
                type:'line',
                data:chart_data.projected_by_release,
                visible: true,
                name: 'Projected US/DE Pts'
            });
        }
        
        var plot_lines = [];
        
        if ( chart_data.current_release_index > 0 ) {
            plot_lines.push({
                color: '#0a0',
                width: 2,
                value: chart_data.current_release_index ,
                label: {
                    text: 'Last Complete Release',
                    style: {
                        color: '#0a0'
                    }
                }
            });
        }
        
        this.down('#chart_box').add({
            xtype:'rallychart',
            chartData: {
                categories: chart_data.categories,
                series: series
            },
            chartConfig: {
                chart: {
                    height: 600
                },
                title: {
                    text: 'Status of Releases',
                    align: 'center'
                },
                yAxis: [{
                    title: {
                        enabled: true,
                        text: 'Story Points',
                        style: { fontWeight: 'normal' }
                    },
                    min: 0
                }],
                tooltip: {
                    shared: true,
                    valueSuffix: ' pts'
                },
                xAxis: [{
                    title: {
                        enabled: true,
                        text: 'Releases'
                    },
                    minorTickInterval: null, 
                    tickLength: 0,
                    categories: chart_data.categories,
                    labels: {
                        rotation: 90,
                        align: 'left'
                    },
                    plotLines: plot_lines
                }],
                plotOptions: {
                    column: {
                        pointWidth: 20
                    }
                }
            }
        });
        this.down('#header_box').getEl().unmask();
    }
});