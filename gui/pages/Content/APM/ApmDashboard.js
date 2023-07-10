import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from "next/image";
import style from "./Apm.module.css";
import 'react-toastify/dist/ReactToastify.css';
import {getActiveRuns, getAgentRuns, getAllAgents, getToolsUsage, getMetrics} from "@/pages/api/DashboardService";
import {formatNumber, formatTime, formatRunTimeDifference, averageAgentRunTime} from "@/utils/utils";
import * as echarts from 'echarts';
import { WidthProvider, Responsive } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);
export default function ApmDashboard() {
    const [totalCalls, setTotalCalls] = useState(0);
    const [totalTokens, setTotalTokens] = useState(0);
    const [totalRuns, setTotalRuns] = useState(0);
    const [totalAgents, setTotalAgents] = useState(0);
    const [allAgents, setAllAgents] = useState([]);
    const [allModels, setAllModels] = useState([]);
    const [dropdown, setDropDown] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState('Select an Agent');
    const [selectedAgentIndex, setSelectedAgentIndex] = useState(-1);
    const [selectedAgentRun, setSelectedAgentRun] = useState([]);
    const [activeRuns, setActiveRuns] = useState([]);
    const [selectedAgentDetails, setSelectedAgentDetails] = useState(null);
    const [toolsUsed, setToolsUsed] = useState([]);
    const [averageRunTime, setAverageRunTime] = useState('');
    const initialLayout = [
        {i: 'total_tokens', x: 0, y: 0, w: 4, h: 1.5},
        {i: 'total_runs', x: 4, y: 0, w: 4, h: 1.5},
        {i: 'total_calls', x: 8, y: 0, w: 4, h: 1.5},
        {i: 'agent_details', x: 0, y: 1, w: 8, h: 4.5},
        {i: 'total_agents', x: 8, y: 1, w: 4, h: 1.5},
        {i: 'average_tokens', x: 8, y: 2, w: 4, h: 1.5},
        {i: 'average_calls', x: 8, y: 3, w: 4, h: 1.5},
        {i: 'active_agents', x: 0, y: 4, w: 5, h: 2},
        {i: 'used_tools', x: 5, y: 4, w: 5, h: 2},
        {i: 'calls_per_run', x: 0, y: 5, w: 5, h: 2},
        {i: 'tokens_per_run', x: 5, y: 5, w: 5, h: 2},
        {i: 'active_runs', x: 10, y: 4, w: 2, h: 4},
        {i: 'models_used', x: 0, y: 6, w: 8, h: 3},
    ];
    const storedLayout = localStorage.getItem('myLayoutKey');
    const [layout, setLayout] = useState(storedLayout !== null ? JSON.parse(storedLayout) : initialLayout);
    const firstUpdate = useRef(true);

    const onLayoutChange = (currentLayout) => {
        setLayout(currentLayout);
    };

    const onClickLayoutChange = () => {
        localStorage.setItem('myLayoutKey',JSON.stringify(initialLayout))
        setLayout(initialLayout)
    }

    const optionsGenerator = (allModels) => ({
        yAxis: {
            type: 'category',
            data: allModels.map(item => item.model),
            axisLine: { show: false },
            axisLabel: {
                show: true,
                fontSize: 14,
                fontWeight: 400,
                color: '#FFF',
            },
        },
        xAxis: { type: 'value', show: false },
        series: [{
            data: allModels.map(item => item.agents),
            type: 'bar',
            barWidth: 50,
            label: {
                show: true,
                position: 'right',
                fontSize: 14,
                fontWeight: 400,
                color: '#FFF',
                formatter: (params) => params.data
            },
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#7491EA' }, { offset: 1, color: '#9865D9' }], false),
            },
            emphasis: {
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#7491EA' }, { offset: 1, color: '#9865D9' }], false),
                    shadowBlur: 20,
                    shadowColor: 'rgba(0, 0, 0, 0.1)'
                }
            },
            animationEasing: 'elasticOut',
            animationDelayUpdate: (idx) => idx * 5
        }],
        grid: {
            show: false,
            height: allModels.length * 60
        },
        tooltip: {
            show: true,
            trigger: 'axis',
            axisPointer: { type: 'line' },
            formatter: (params) =>  `${params[0].name}: ${params[0].value}`
        },
    });

    useEffect(() => {
        const chartDom = document.getElementById('barChart');
        const myChart = echarts.init(chartDom);
        const options = optionsGenerator(allModels);
        if(options) myChart.setOption(options);
    }, [allModels]);

    useEffect(() => {
        if (!firstUpdate.current) {
            localStorage.setItem('myLayoutKey', JSON.stringify(layout));
        } else {
            firstUpdate.current = false;
        }
    }, [layout]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [metricsResponse, agentsResponse, activeRunsResponse, toolsUsageResponse] = await Promise.all([getMetrics(), getAllAgents(), getActiveRuns(), getToolsUsage()]);

                setTotalCalls(metricsResponse.data.total_calls);
                setTotalTokens(metricsResponse.data.total_tokens);
                setTotalRuns(metricsResponse.data.runs_completed);
                setTotalAgents(agentsResponse.data.agent_details.length);
                setAllAgents(agentsResponse.data.agent_details);
                setAllModels(agentsResponse.data.model_info);
                setActiveRuns(activeRunsResponse.data);
                setToolsUsed(toolsUsageResponse.data);
            } catch(error) {
                console.log(`Error in fetching data: ${error}`);
            }
        }

        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSelectedAgent = useCallback((index, name) => {
        setDropDown(false)
        setSelectedAgent(name)
        setSelectedAgentIndex(index)
        const agentDetails = allAgents.find(agent => agent.agent_id === index);
        setSelectedAgentDetails(agentDetails);

        getAgentRuns(index).then((response) => {
            const data = response.data;
            setSelectedAgentRun(data);
            setAverageRunTime(averageAgentRunTime(data));
        }).catch((error) => console.error(`Error in fetching agent runs: ${error}`));
    }, [allAgents]);

    useEffect(() => handleSelectedAgent(selectedAgentIndex,selectedAgent),[allAgents]);

    useEffect(() => {
        if(allAgents.length > 0 && selectedAgent === 'Select an Agent') {
            const lastAgent = allAgents[allAgents.length-1];
            handleSelectedAgent(lastAgent.agent_id, lastAgent.name);
        }
    }, [allAgents, selectedAgent, handleSelectedAgent]);


    return (
        <div className={style.apm_dashboard_container}>
            <div id="apm_dashboard" className={style.apm_dashboard}>
                <div style={{display:'inline-flex',justifyContent:'space-between',width:'100%',alignItems:'center',padding:'0 8px'}}>
                    <span className="text_14 mt_10 ml_6">Agent Performance Monitoring</span>
                    <button onClick={() => onClickLayoutChange()} className="primary_button">Reset</button>
                </div>
                <ResponsiveGridLayout
                    className="layout"
                    layouts={{lg: layout}}
                    onLayoutChange={onLayoutChange}
                    breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
                    cols={{lg: 12, md: 12, sm: 12, xs: 12, xxs: 12}}>
                    <div key="total_tokens" className="display_column_container">
                        <span className="text_14 mb_8">Total tokens consumed</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{formatNumber(totalTokens)}</div>
                    </div>
                    <div key="total_runs" className="display_column_container">
                        <span className="text_14 mb_8">Total runs</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{formatNumber(totalRuns)}</div>
                    </div>
                    <div key="total_calls" className="display_column_container">
                        <span className="text_14 mb_8">Total calls</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{formatNumber(totalCalls)}</div>
                    </div>
                    <div key="agent_details" className="display_column_container">
                        <div style={{display:'inline-flex',justifyContent:'space-between',width:'100%'}}>
                            <span className="text_14 mb_8">Agent & Run details</span>
                            <div style={{position:'relative',display:'flex',flexDirection:'column'}}>
                                {allAgents.length > 0 && <div>
                                    <div className="text_14 mb_8 cursor_pointer" onClick={() => setDropDown(!dropdown)}>{selectedAgent} <img width={18} height={16} src="/images/expand_more.svg" /></div>
                                    {dropdown &&
                                        <div className="custom_select_options" style={{padding:'8px'}}>
                                            {allAgents.map((agent,index) => (
                                                <div key={index} className="custom_select_option" style={{padding: '8px'}} onClick={() => handleSelectedAgent(agent.agent_id,agent.name)}>{agent.name}</div>
                                            ))}
                                        </div>}
                                </div>}
                            </div>
                        </div>
                        <div className="my_rows mt_24" style={{gap:'4px', padding:'0 7px'}}>
                            <div className="my_col_4 text_12 vertical_container">Agent <span className="text_20_bold mt_10">{selectedAgentDetails?.name || '-'}</span></div>
                            <div className="my_col_2 text_12 vertical_container align_end"><div className="vertical_container w_fit_content">Total Runs <span className="text_20_bold mt_10">{selectedAgentDetails?.runs_completed || '-'}</span></div></div>
                            <div className="my_col_2 text_12 vertical_container align_end"><div className="vertical_container w_fit_content">Total Calls <span className="text_20_bold mt_10">{selectedAgentDetails?.total_calls || '-'}</span></div></div>
                            <div className="my_col_2 text_12 vertical_container align_end"><div className="vertical_container w_fit_content">Tokens Consumed <span className="text_20_bold mt_10">{selectedAgentDetails?.total_tokens ? formatNumber(selectedAgentDetails.total_tokens) : '-' }</span></div></div>
                            <div className="my_col_2 text_12 vertical_container align_end"><div className="vertical_container w_fit_content">Average run time <span className="text_20_bold mt_10">{averageRunTime !== '0.0 min' ? averageRunTime:'-'}</span></div></div>
                        </div>
                        {selectedAgentRun.length === 0 ?
                            <div className="vertical_container align_center mt_50 w_100">
                                <img src="/images/no_permissions.svg" width={300} height={120} alt="No Data"/>
                                <span className="text_12 color_white mt_6">{selectedAgent === 'Select an Agent' ? 'Please Select an Agent' : <React.Fragment>No Runs found for <b>{selectedAgent}</b></React.Fragment>}</span>
                            </div> : <div className="scrollable_container mt_16">
                                <table className="table_css mt_10">
                                    <thead>
                                    <tr style={{borderTop:'none'}}>
                                        <th className="table_header">Run Name</th>
                                        <th className="table_header text_align_right">Tokens Consumed <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                        <th className="table_header text_align_right">Calls <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                        <th className="table_header text_align_right">Run Time <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {selectedAgentRun.map((run, i) => (
                                        <tr key={i}>
                                            <td className="table_data" style={{width:'60%'}}>{run.name}</td>
                                            <td className="table_data text_align_right" style={{width:'18%'}}>{run.tokens_consumed}</td>
                                            <td className="table_data text_align_right" style={{width:'10%'}}>{run.calls}</td>
                                            <td className="table_data text_align_right" style={{width:'12%'}}>{formatRunTimeDifference(run.updated_at,run.created_at)}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>}
                    </div>
                    <div key="total_agents" className="display_column_container">
                        <span className="text_14 mb_8">Number of Agents</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{formatNumber(totalAgents)}</div>
                    </div>
                    <div key="average_tokens" className="display_column_container">
                        <span className="text_14 mb_8">Average tokens consumed per run</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{totalRuns?formatNumber(totalTokens/totalRuns):'-'}</div>
                    </div>
                    <div key="average_calls" className="display_column_container">
                        <span className="text_14 mb_8">Average calls made per run</span>
                        <div className="text_60_bold display_flex justify_center align_center w_100 h_100 mb_24 mt_24">{totalRuns?formatNumber(totalCalls/totalRuns):'-'}</div>
                    </div>
                    <div key="active_agents" className="display_column_container">
                        <span className="text_14 mb_8">Most active agents</span>
                        {allAgents.length === 0 ?
                            <div className="vertical_container align_center mt_70 w_100">
                                <img src="/images/no_permissions.svg" width={190} height={74} alt="No Data"/>
                                <span className="text_12 color_white mt_6">No Active Agents Found</span>
                            </div> : <div className="scrollable_container">
                                <table className="table_css mt_10">
                                    <thead>
                                    <tr style={{borderTop:'none'}}>
                                        <th className="table_header">Agent</th>
                                        <th className="table_header text_align_right">Runs <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {allAgents.sort((a,b) => b.runs_completed - a.runs_completed).map((agent, i) => (
                                        <tr key={i}>
                                            <td className="table_data" style={{width:'20%'}}>{agent.name}</td>
                                            <td className="table_data" style={{width:'100%',display:'inline-flex'}}>
                                                <div className="progress-bar">
                                                    <div className="filled" style={{width: `${(agent.runs_completed/(allAgents[0].runs_completed+0.1))*100}%`}}>
                                                        <div className="shine"></div>
                                                    </div>
                                                </div>
                                                <span>{agent.runs_completed}</span>
                                            </td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>}
                    </div>
                    <div key="used_tools" className="display_column_container">
                        <span className="text_14 mb_8">Most used tools</span>
                        {toolsUsed.length === 0 ?
                            <div className="vertical_container align_center mt_70 w_100">
                                <img src="/images/no_permissions.svg" width={190} height={74} alt="No Data"/>
                                <span className="text_12 color_white mt_6">No Used Tools Found</span>
                            </div> : <div className="scrollable_container">
                                <table className="table_css mt_10">
                                    <thead>
                                    <tr style={{borderTop:'none'}}>
                                        <th className="table_header">Tool</th>
                                        <th className="table_header text_align_right">Agents <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                        <th className="table_header text_align_right">Iterations</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {toolsUsed.map((tool, index) => (
                                        <tr key={index}>
                                            <td className="table_data" style={{width:'68%'}}>{tool.tool_name}</td>
                                            <td className="table_data text_align_right" style={{width:'16%'}}>{tool.unique_agents}</td>
                                            <td className="table_data text_align_right" style={{width:'16%'}}>{tool.total_usage}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>}
                    </div>
                    <div key="calls_per_run" className="display_column_container">
                        <span className="text_14 mb_8">Calls per run</span>
                        {allAgents.length === 0 ?
                            <div className="vertical_container align_center mt_70 w_100">
                                <img src="/images/no_permissions.svg" width={190} height={74} alt="No Data"/>
                                <span className="text_12 color_white mt_6">No Agents/Runs Found</span>
                            </div> : <div className="scrollable_container">
                                <table className="table_css mt_10">
                                    <thead>
                                    <tr style={{borderTop:'none'}}>
                                        <th className="table_header">Agent</th>
                                        <th className="table_header text_align_right">Average calls per runs <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {allAgents.map((agent, i) => (
                                        <tr key={i}>
                                            <td className="table_data" style={{width:'70%'}}>{agent.name}</td>
                                            <td className="table_data text_align_right" style={{width:'30%'}}>{agent.runs_completed?(agent.total_calls/agent.runs_completed).toFixed(1):'-'}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>}
                    </div>
                    <div key="tokens_per_run" className="display_column_container">
                        <span className="text_14 mb_8">Tokens per run</span>
                        {allAgents.length === 0 ?
                            <div className="vertical_container align_center mt_70 w_100">
                                <img src="/images/no_permissions.svg" width={190} height={74} alt="No Data"/>
                                <span className="text_12 color_white mt_6">No Agents/Runs Found</span>
                            </div> : <div className="scrollable_container">
                                <table className="table_css mt_10">
                                    <thead>
                                    <tr style={{borderTop:'none'}}>
                                        <th className="table_header">Agent</th>
                                        <th className="table_header text_align_right">Average Tokens per runs <img width={14} height={14} src="/images/arrow_downward.svg" alt="arrow_down"/></th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {allAgents.map((agent, i) => (
                                        <tr key={i}>
                                            <td className="table_data" style={{width:'66%'}}>{agent.name}</td>
                                            <td className="table_data text_align_right" style={{width:'34%'}}>{agent.runs_completed?(agent.total_tokens/agent.runs_completed).toFixed(1):'-'}</td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>}
                    </div>
                    <div key="active_runs" className="display_column_container">
                        <span className="text_14 mb_8">Active Runs</span>
                        <div className="scrollable_container gap_8">
                            {activeRuns.length === 0 ?
                                <div className="vertical_container align_center mt_24">
                                    <img src="/images/no_permissions.svg" width={190} height={74} alt="No Data"/>
                                    <span className="text_12 color_white mt_6">No active runs found</span>
                                </div> : activeRuns.map((run,index) => (
                                    <div className="active_runs">
                                        <span className="text_14">{run.name}</span>
                                        <div style={{display:'inline-flex',alignItems:'center'}}><span className="text_12 mt_6">{run.agent_name}  ·  <Image width={12} height={12} src="/images/schedule.svg" alt="schedule-icon" /> {formatTime(run.created_at)}</span></div>
                                    </div>
                                ))}
                        </div>
                    </div>
                    <div key="models_used" className="display_column_container">
                        <span className="text_14 mb_8">Models used by agents</span>
                        <div id="barChart" style={{width: "50vw", height: 300}}></div>
                    </div>
                </ResponsiveGridLayout>
            </div>
        </div>
    );
}