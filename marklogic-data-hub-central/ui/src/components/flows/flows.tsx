import React, {useState, CSSProperties, useEffect, useContext, createRef} from "react";
import {Collapse, Icon, Card, Modal, Menu, Dropdown} from "antd";
import {DownOutlined} from "@ant-design/icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrashAlt, faArrowAltCircleRight, faArrowAltCircleLeft} from "@fortawesome/free-regular-svg-icons";
import {MLButton} from "@marklogic/design-system";
import NewFlowDialog from "./new-flow-dialog/new-flow-dialog";
import sourceFormatOptions from "../../config/formats.config";
import {RunToolTips, SecurityTooltips} from "../../config/tooltips.config";
import "./flows.scss";
import styles from "./flows.module.scss";
import {MLTooltip, MLSpin} from "@marklogic/design-system";
import {useDropzone} from "react-dropzone";
import {AuthoritiesContext} from "../../util/authorities";
import {Link, useLocation} from "react-router-dom";
import axios from "axios";
import {getViewSettings, setViewSettings, UserContext} from "../../util/user-context";


enum ReorderFlowOrderDirection {
  LEFT = "left",
  RIGHT = "right"
}

const {Panel} = Collapse;

interface Props {
  flows: any;
  steps: any;
  deleteFlow: any;
  createFlow: any;
  updateFlow: any;
  deleteStep: any;
  runStep: any;
  canReadFlow: boolean;
  canWriteFlow: boolean;
  hasOperatorRole: boolean;
  running: any;
  uploadError: string;
  newStepToFlowOptions: any;
  addStepToFlow: any;
  flowsDefaultActiveKey: any;
  showStepRunResponse: any;
  runEnded: any;
  onReorderFlow: (flowIndex: number, newSteps: Array<any>) => void
}

const StepDefinitionTypeTitles = {
  "INGESTION": "Load",
  "ingestion": "Load",
  "MAPPING": "Map",
  "mapping": "Map",
  "MASTERING": "Master",
  "mastering": "Master",
  "MATCHING": "Match",
  "matching": "Match",
  "MERGING": "Merge",
  "merging": "Merge",
  "CUSTOM": "Custom",
  "custom": "Custom"
};

const Flows: React.FC<Props> = (props) => {
  const storage = getViewSettings();
  const openFlows = storage?.run?.openFlows;
  const hasDefaultKey = JSON.stringify(props.newStepToFlowOptions?.flowsDefaultKey) !== JSON.stringify(["-1"]);

  const {handleError} = useContext(UserContext);
  const [newFlow, setNewFlow] = useState(false);
  const [addedFlowName, setAddedFlowName] = useState("");
  const [title, setTitle] = useState("");
  const [flowData, setFlowData] = useState({});
  const [dialogVisible, setDialogVisible] = useState(false);
  const [stepDialogVisible, setStepDialogVisible] = useState(false);
  const [addStepDialogVisible, setAddStepDialogVisible] = useState(false);
  const [flowName, setFlowName] = useState("");
  const [stepName, setStepName] = useState("");
  const [stepType, setStepType] = useState("");
  const [stepNumber, setStepNumber] = useState("");
  const [runningStep, setRunningStep] = useState<any>({});
  const [runningFlow, setRunningFlow] = useState<any>("");
  const [fileList, setFileList] = useState<any[]>([]);
  const [showUploadError, setShowUploadError] = useState(false);
  const [openNewFlow, setOpenNewFlow] = useState(props.newStepToFlowOptions?.addingStepToFlow && !props.newStepToFlowOptions?.existingFlow);
  const [activeKeys, setActiveKeys] = useState(
    hasDefaultKey && (props.newStepToFlowOptions?.flowsDefaultKey ?? []).length > 0 ?
      props.newStepToFlowOptions?.flowsDefaultKey :
      (openFlows ? openFlows : [])
  );
  const [showLinks, setShowLinks] = useState("");
  const [startRun, setStartRun] = useState(false);
  const [latestJobData, setLatestJobData] = useState<any>({});
  const [createAdd, setCreateAdd] = useState(true);
  const [addFlowDirty, setAddFlowDirty] = useState({});
  const [addExternalFlowDirty, setExternalAddFlowDirty] = useState(true);
  const [hasQueriedInitialJobData, setHasQueriedInitialJobData] = useState(false);
  const location = useLocation();

  // maintain a list of panel refs
  const flowPanels: any = props.flows.reduce((p, n) => ({...p, ...{[n.name]: createRef()}}), {});

  // Persists active keys in session storage as a user interacts with them
  useEffect(() => {
    if (activeKeys === undefined) {
      return;
    }
    const newStorage = {...storage, run: {...storage.run, openFlows: activeKeys}};
    setViewSettings(newStorage);
  }, [activeKeys]);

  // If a step was just added scroll the flow step panel fully to the right
  useEffect(() => {
    const scrollToEnd = f => {
      const panel = flowPanels[f];
      if (panel && panel.current) {
        const {scrollWidth} = panel.current;
        panel.current.scrollTo(scrollWidth * 2, 0);
      }
    };
    if (!props.flows.length) return;
    const currentFlow = props.flows.filter(({name}) => name === flowName).shift();
    if (currentFlow?.steps?.length > addFlowDirty[flowName]) {
      // Scrolling should happen on the last update after the number of steps in the flow has been updated
      scrollToEnd(flowName);
      setAddFlowDirty({...addFlowDirty, [flowName]: currentFlow?.steps?.length});
    } else {
      // if step is added from external view
      const state:{} = location;
      const externalDirty = (state ? state["addFlowDirty"] : false) && addExternalFlowDirty;
      const thisFlow = state ? state["flowName"] : null;
      if (externalDirty) {
        scrollToEnd(thisFlow);
        setExternalAddFlowDirty(false);
      }
    }
  }, [props.flows]);

  useEffect(() => {
    if (openFlows === undefined || props.flows.length === 0 || hasQueriedInitialJobData) {
      return;
    }

    // Shows job data for steps in a flow that is expanded in session storage
    openFlows.forEach(flowKey => {
      getFlowWithJobInfo(Number(flowKey));
    });

    setHasQueriedInitialJobData(true);
  }, [props.flows]);

  useEffect(() => {
    if (JSON.stringify(props.flowsDefaultActiveKey) !== JSON.stringify([]) && props.flowsDefaultActiveKey.length >= activeKeys.length) {
      setActiveKeys([...props.flowsDefaultActiveKey]);
    }

    if (props.flows) {
      // Get the latest job info when a step is added to an existing flow from Curate or Load Tile
      if (JSON.stringify(props.flows) !== JSON.stringify([])) {
        let stepsInFlow = props.flows[props.newStepToFlowOptions?.flowsDefaultKey]?.steps;
        if (props.newStepToFlowOptions && props.newStepToFlowOptions.addingStepToFlow && props.newStepToFlowOptions.existingFlow && props.newStepToFlowOptions.flowsDefaultKey && props.newStepToFlowOptions.flowsDefaultKey !== -1) {
          getFlowWithJobInfo(props.newStepToFlowOptions.flowsDefaultKey);
          if (startRun) {
            //run step after step is added to an existing flow
            if (props.newStepToFlowOptions.stepDefinitionType === "ingestion") {
              setShowUploadError(false);
              setRunningStep(stepsInFlow[stepsInFlow.length - 1]);
              setRunningFlow(props.newStepToFlowOptions?.flowName);
              openFilePicker();
              setStartRun(false);
            } else {
              props.runStep(props.newStepToFlowOptions?.flowName, stepsInFlow[stepsInFlow.length - 1]);
              setStartRun(false);
            }
          }
          //run step that is already inside a flow
        } else if (props.newStepToFlowOptions && !props.newStepToFlowOptions.addingStepToFlow && props.newStepToFlowOptions.startRunStep && props.newStepToFlowOptions.flowsDefaultKey && props.newStepToFlowOptions.flowsDefaultKey !== -1) {
          let runStepNum = stepsInFlow.findIndex(s => s.stepName === props.newStepToFlowOptions?.newStepName);
          if (startRun) {
            if (props.newStepToFlowOptions.stepDefinitionType === "ingestion") {
              setShowUploadError(false);
              setRunningStep(stepsInFlow[runStepNum]);
              setRunningFlow(props.newStepToFlowOptions?.flowName);
              openFilePicker();
              setStartRun(false);
            } else {
              props.runStep(props.newStepToFlowOptions?.flowName, stepsInFlow[runStepNum]);
              setStartRun(false);
            }
          }
        }
      }
    }
    if (activeKeys === undefined) {
      setActiveKeys([]);
    }
  }, [props.flows]);


  useEffect(() => {
    //run step after step is added to a new flow
    if (props.newStepToFlowOptions && !props.newStepToFlowOptions.existingFlow && startRun && addedFlowName) {
      let indexFlow = props.flows?.findIndex(i => i.name === addedFlowName);
      if (props.flows[indexFlow]?.steps.length > 0) {
        let indexStep = props.flows[indexFlow].steps.findIndex(s => s.stepName === props.newStepToFlowOptions.newStepName);
        if (props.flows[indexFlow].steps[indexStep].stepDefinitionType === "ingestion") {
          setShowUploadError(false);
          setRunningStep(props.flows[indexFlow].steps[indexStep]);
          setRunningFlow(addedFlowName);
          openFilePicker();
        } else {
          props.runStep(addedFlowName, props.flows[indexFlow].steps[indexStep]);
          setAddedFlowName("");
          setStartRun(false);
        }
      }
    }
  }, [props.steps]);


  // Get the latest job info after a step (in a flow) run
  useEffect(() => {
    let num = props.flows.findIndex((flow) => flow.name === props.runEnded.flowId);
    if (num >= 0) {
      getFlowWithJobInfo(num);
    }
  }, [props.runEnded]);


  useEffect(() => {
    if (props.newStepToFlowOptions && props.newStepToFlowOptions.startRunStep) {
      setStartRun(true);
    }
  }, [props.newStepToFlowOptions]);


  // For role-based privileges
  const authorityService = useContext(AuthoritiesContext);
  const authorityByStepType = {
    ingestion: authorityService.canReadLoad(),
    mapping: authorityService.canReadMapping(),
    matching: authorityService.canReadMatchMerge(),
    merging: authorityService.canReadMatchMerge(),
    custom: authorityService.canReadCustom()
  };

  const OpenAddNewDialog = () => {
    setCreateAdd(false);
    setTitle("New Flow");
    setNewFlow(true);
  };

  //Custom CSS for source Format
  const sourceFormatStyle = (sourceFmt) => {
    let customStyles: CSSProperties;
    if (!sourceFmt) {
      customStyles = {
        float: "left",
        backgroundColor: "#fff",
        color: "#fff",
        padding: "5px"
      };
    } else {
      customStyles = {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: "35px",
        width: "35px",
        lineHeight: "35px",
        backgroundColor: sourceFormatOptions[sourceFmt].color,
        fontSize: sourceFmt === "json" ? "12px" : "13px",
        borderRadius: "50%",
        textAlign: "center",
        color: "#ffffff",
        verticalAlign: "middle"
      };
    }
    return customStyles;
  };

  const handleStepAdd = async (stepName, flowName, stepType) => {
    setAddStepDialogVisible(true);
    setFlowName(flowName);
    setStepName(stepName);
    setStepType(stepType);
  };

  const handleFlowDelete = (name) => {
    setDialogVisible(true);
    setFlowName(name);
  };

  const handleStepDelete = (flowName, stepDetails) => {
    setStepDialogVisible(true);
    setFlowName(flowName);
    setStepName(stepDetails.stepName);
    setStepType(stepDetails.stepDefinitionType);
    setStepNumber(stepDetails.stepNumber);
  };

  const onOk = (name) => {
    props.deleteFlow(name);
    setDialogVisible(false);
  };

  const onStepOk = (flowName, stepNumber) => {
    props.deleteStep(flowName, stepNumber);
    setStepDialogVisible(false);
  };

  const onAddStepOk = async (stepName, flowName, stepType) => {
    await props.addStepToFlow(stepName, flowName, stepType);
    // Open flow panel if not open
    const flowIndex = props.flows.findIndex(f => f.name === flowName);
    if (!activeKeys.includes(flowIndex)) {
      let newActiveKeys = [...activeKeys, flowIndex];
      setActiveKeys(newActiveKeys);
    }
    await setAddStepDialogVisible(false);
    await setAddFlowDirty({...addFlowDirty, [flowName]: props.flows[flowIndex].steps.length});
  };

  const onCancel = () => {
    setDialogVisible(false);
    setStepDialogVisible(false);
    setAddStepDialogVisible(false);
  };

  const isStepInFlow = (stepName, flowName) => {
    let result = false;
    let flow;
    if (props.flows) flow = props.flows.find(f => f.name === flowName);
    if (flow) result = flow["steps"].findIndex(s => s.stepName === stepName) > -1;
    return result;
  };

  // Setup for file upload
  const {getRootProps, getInputProps, open, acceptedFiles} = useDropzone({
    noClick: true,
    noKeyboard: true
  });

  const openFilePicker = () => {
    open();
    setStartRun(false);
  };

  useEffect(() => {
    acceptedFiles.forEach(file => {
      setFileList(prevState => [...prevState, file]);
    });
    if (startRun) {
      setAddedFlowName("");
      setStartRun(false);
    }
  }, [acceptedFiles]);

  useEffect(() => {
    customRequest();
  }, [fileList]);


  const deleteConfirmation = (
    <Modal
      visible={dialogVisible}
      okText={<div aria-label="Yes">Yes</div>}
      okType="primary"
      cancelText={<div aria-label="No">No</div>}
      onOk={() => onOk(flowName)}
      onCancel={() => onCancel()}
      width={350}
      destroyOnClose={true}
    >
      <div className={styles.confirmationText}>Are you sure you want to delete the <strong>{flowName}</strong> flow?</div>
    </Modal>
  );

  const deleteStepConfirmation = (
    <Modal
      visible={stepDialogVisible}
      okText={<div aria-label="Yes">Yes</div>}
      okType="primary"
      cancelText={<div aria-label="No">No</div>}
      onOk={() => onStepOk(flowName, stepNumber)}
      onCancel={() => onCancel()}
      width={350}
      destroyOnClose={true}
    >
      <div className={styles.confirmationText}>Are you sure you want to remove the <strong>{stepName}</strong> step from the <strong>{flowName}</strong> flow?</div>
    </Modal>
  );

  const addStepConfirmation = (
    <Modal
      visible={addStepDialogVisible}
      okText={<div aria-label="Yes">Yes</div>}
      okType="primary"
      cancelText={<div aria-label="No">No</div>}
      onOk={() => onAddStepOk(stepName, flowName, stepType)}
      onCancel={() => onCancel()}
      width={350}
    >
      <div className={styles.confirmationText}>
        {
          isStepInFlow(stepName, flowName)
            ?
            <p>The step <b>{stepName}</b> is already in the flow <b>{flowName}</b>. Would you like to add another instance?</p>
            :
            <p>Are you sure you want to add step <b>{stepName}</b> to flow <b>{flowName}</b>?</p>
        }
      </div>
    </Modal>
  );

  const stepMenu = (flowName) => {
    return (
      <Menu>
        <Menu.ItemGroup title="Load">
          {props.steps && props.steps["ingestionSteps"] && props.steps["ingestionSteps"].length > 0 ? props.steps["ingestionSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "ingestion"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
        <Menu.ItemGroup title="Map">
          {props.steps && props.steps["mappingSteps"] && props.steps["mappingSteps"].length > 0 ? props.steps["mappingSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "mapping"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
        <Menu.ItemGroup title="Match">
          {props.steps && props.steps["matchingSteps"] && props.steps["matchingSteps"].length > 0 ? props.steps["matchingSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "matching"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
        <Menu.ItemGroup title="Merge">
          {props.steps && props.steps["mergingSteps"] && props.steps["mergingSteps"].length > 0 ? props.steps["mergingSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "merging"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
        <Menu.ItemGroup title="Master">
          {props.steps && props.steps["masteringSteps"] && props.steps["masteringSteps"].length > 0 ? props.steps["masteringSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "mastering"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
        <Menu.ItemGroup title="Custom">
          {props.steps && props.steps["customSteps"] && props.steps["customSteps"].length > 0 ? props.steps["customSteps"].map((elem, index) => (
            <Menu.Item key={index} aria-label={`${elem.name}-to-flow`}>
              <div
                onClick={() => { handleStepAdd(elem.name, flowName, "custom"); }}
              >{elem.name}</div>
            </Menu.Item>
          )) : null}
        </Menu.ItemGroup>
      </Menu>
    );
  };

  const panelActions = (name, i) => (
    <div
      id="panelActions"
      onClick={event => {
        event.stopPropagation(); // Do not trigger collapse
        event.preventDefault();
      }}
    >
      <Dropdown
        overlay={stepMenu(name)}
        trigger={["click"]}
        disabled={!props.canWriteFlow}
        overlayClassName="stepMenu"
      >
        {props.canWriteFlow ?
          <MLButton
            className={styles.addStep}
            size="default"
            aria-label={`addStep-${name}`}
            style={{}}
            type="primary"
          >Add Step <DownOutlined /></MLButton>
          :
          <MLTooltip title={SecurityTooltips.missingPermission} overlayStyle={{maxWidth: "175px"}} placement="bottom">
            <span className={styles.disabledCursor}>
              <MLButton
                className={styles.addStep}
                size="default"
                aria-label={"addStepDisabled-" + i}
                style={{backgroundColor: "#f5f5f5", borderColor: "#f5f5f5", pointerEvents: "none"}}
                type="primary"
                disabled={!props.canWriteFlow}
              >Add Step <DownOutlined /></MLButton>
            </span>
          </MLTooltip>
        }
      </Dropdown>
      <span className={styles.deleteFlow}>
        {props.canWriteFlow ?
          <MLTooltip title={"Delete Flow"} placement="bottom">
            <i aria-label={`deleteFlow-${name}`}>
              <FontAwesomeIcon
                icon={faTrashAlt}
                onClick={() => { handleFlowDelete(name); }}
                data-testid={`deleteFlow-${name}`}
                className={styles.deleteIcon}
                size="lg" />
            </i>
          </MLTooltip>
          :
          <MLTooltip title={"Delete Flow: " + SecurityTooltips.missingPermission} overlayStyle={{maxWidth: "225px"}} placement="bottom">
            <i aria-label={`deleteFlowDisabled-${name}`}>
              <FontAwesomeIcon
                icon={faTrashAlt}
                data-testid={`deleteFlow-${name}`}
                className={styles.disabledDeleteIcon}
                size="lg" />
            </i>
          </MLTooltip>}
      </span>
    </div>
  );

  const flowHeader = (name, index) => (
    <MLTooltip title={props.canWriteFlow ? "Edit Flow" : "Flow Details"} placement="right">
      <span className={styles.flowName} onClick={(e) => OpenEditFlowDialog(e, index)}>
        {name}
      </span>
    </MLTooltip>
  );

  const OpenEditFlowDialog = (e, index) => {
    e.stopPropagation();
    setTitle("Edit Flow");
    setFlowData(prevState => ({...prevState, ...props.flows[index]}));
    setNewFlow(true);
  };

  const StepDefToTitle = (stepDef) => {
    return (StepDefinitionTypeTitles[stepDef]) ? StepDefinitionTypeTitles[stepDef] : "Unknown";
  };

  const customRequest = async () => {
    const filenames = fileList.map(({name}) => name);
    if (filenames.length) {
      let fl = fileList;
      const formData = new FormData();

      fl.forEach(file => {
        formData.append("files", file);
      });
      await props.runStep(runningFlow, runningStep, formData)
        .then(resp => {
          setShowUploadError(true);
          setFileList([]);
        });
    }
  };

  const isRunning = (flowId, stepId) => {
    let result = props.running.find(r => (r.flowId === flowId && r.stepId === stepId));
    return result !== undefined;
  };

  function handleMouseOver(e, name) {
    setShowLinks(name);
  }

  const showStepRunResponse = async (step) => {
    try {
      let response = await axios.get("/api/jobs/" + step.jobId);
      if (response.status === 200) {
        props.showStepRunResponse(step, step.jobId, response.data);
      }
    } catch (error) {
      handleError(error);
    }
  };

  const lastRunResponse = (step) => {
    let stepEndTime, tooltipText;
    if (step.stepEndTime) {
      stepEndTime = new Date(step.stepEndTime).toLocaleString();
    }
    if (!step.lastRunStatus) {
      return;
    } else if (step.lastRunStatus === "completed step " + step.stepNumber) {
      tooltipText = "Step last ran successfully on " + stepEndTime;
      return (
        <MLTooltip overlayStyle={{maxWidth: "200px"}} title={tooltipText} placement="bottom" getPopupContainer={() => document.getElementById("flowSettings") || document.body}
          onClick={(e) => showStepRunResponse(step)}>
          <Icon type="check-circle" theme="filled" className={styles.successfulRun} />
        </MLTooltip>
      );

    } else if (step.lastRunStatus === "completed with errors step " + step.stepNumber) {
      tooltipText = "Step last ran with errors on " + stepEndTime;
      return (
        <MLTooltip overlayStyle={{maxWidth: "190px"}} title={tooltipText} placement="bottom" getPopupContainer={() => document.getElementById("flowSettings") || document.body}
          onClick={(e) => showStepRunResponse(step)}>
          <Icon type="exclamation-circle" theme="filled" className={styles.unSuccessfulRun} />
        </MLTooltip>
      );
    } else {
      tooltipText = "Step last failed on " + stepEndTime;
      return (
        <MLTooltip overlayStyle={{maxWidth: "175px"}} title={tooltipText} placement="bottom" getPopupContainer={() => document.getElementById("flowSettings") || document.body}
          onClick={(e) => showStepRunResponse(step)}>
          <Icon type="exclamation-circle" theme="filled" className={styles.unSuccessfulRun} />
        </MLTooltip>
      );
    }
  };

  const updateFlow = async (flowName, flowDesc, steps) => {
    let updatedFlow;
    try {
      updatedFlow = {
        name: flowName,
        steps: steps,
        description: flowDesc
      };
      await axios.put(`/api/flows/` + flowName, updatedFlow);

    } catch (error) {
      console.error("Error updating flow", error);
    }
  };

  const reorderFlow = (id, flowName, direction: ReorderFlowOrderDirection) => {
    let flowNum = props.flows.findIndex((flow) => flow.name === flowName);
    let flowDesc = props.flows[flowNum]["description"];
    const stepList = props.flows[flowNum]["steps"];
    let newSteps = stepList;

    if (direction === ReorderFlowOrderDirection.RIGHT) {
      if (id <= stepList.length - 2) {
        newSteps = [...stepList];
        const oldLeftStep = newSteps[id];
        const oldRightStep = newSteps[id + 1];
        newSteps[id] = oldRightStep;
        newSteps[id + 1] = oldLeftStep;
      }
    } else {
      if (id >= 1) {
        newSteps = [...stepList];
        const oldLeftStep = newSteps[id - 1];
        const oldRightStep = newSteps[id];
        newSteps[id - 1] = oldRightStep;
        newSteps[id] = oldLeftStep;
      }
    }

    let steps : string[] = [];
    for (let i = 0; i < newSteps.length; i++) {
      newSteps[i].stepNumber = String(i+1);
      steps.push(newSteps[i].stepId);
    }

    const reorderedList = [...newSteps];
    props.onReorderFlow(flowNum, reorderedList);
    updateFlow(flowName, flowDesc, steps);
  };


  const getFlowWithJobInfo = async (flowNum) => {
    let currentFlow = props.flows[flowNum];

    if (currentFlow === undefined) {
      return;
    }

    if (currentFlow["steps"].length > 0) {
      try {
        let response = await axios.get("/api/flows/" + currentFlow.name + "/latestJobInfo");
        if (response.status === 200 && response.data) {
          let currentFlowJobInfo = {};
          currentFlowJobInfo[currentFlow["name"]] = response.data["steps"];
          setLatestJobData(prevJobData => (
            {...prevJobData, ...currentFlowJobInfo}
          ));
        }
      } catch (error) {
        console.error("Error getting latest job info ", error);
      }
    }
  };

  let panels;

  if (props.flows) {
    panels = props.flows.map((flow, i) => {
      let flowName = flow.name;
      let cards = flow.steps.map((step, index) => {
        let sourceFormat = step.sourceFormat;
        let stepNumber = step.stepNumber;
        let viewStepId = `${flowName}-${stepNumber}`;
        let stepDefinitionType = step.stepDefinitionType ? step.stepDefinitionType.toLowerCase() : "";
        let stepDefinitionTypeTitle = StepDefinitionTypeTitles[stepDefinitionType];
        return (
          <div key={viewStepId} id="flowSettings">
            <Card
              className={styles.cardStyle}
              title={StepDefToTitle(step.stepDefinitionType)}
              size="small"
              actions={[
                <div className={styles.reorder}>
                  {index !== 0 && props.canWriteFlow &&
                    <div className={styles.reorderLeft}>
                      <MLTooltip title={"Move left"} placement="bottom" getPopupContainer={() => document.getElementById("flowSettings") || document.body}>
                        <FontAwesomeIcon
                          aria-label={`leftArrow-${step.stepName}`}
                          icon={faArrowAltCircleLeft}
                          className={styles.reorderFlowLeft}
                          role="button"
                          onClick={() => reorderFlow(index, flowName, ReorderFlowOrderDirection.LEFT)}
                          onKeyDown={(e) => reorderFlowKeyDownHandler(e, index, flowName, ReorderFlowOrderDirection.LEFT)}
                          tabIndex={0}/>
                      </MLTooltip>
                    </div>
                  }
                  <div className={styles.reorderRight}>
                    <div className={styles.stepResponse}>
                      {latestJobData && latestJobData[flowName] && latestJobData[flowName][index]
                        ? lastRunResponse(latestJobData[flowName][index])
                        : ""
                      }
                    </div>
                    {index < flow.steps.length - 1 && props.canWriteFlow &&
                      <MLTooltip title={"Move right"} placement="bottom" getPopupContainer={() => document.getElementById("flowSettings") || document.body}>
                        <FontAwesomeIcon
                          aria-label={`rightArrow-${step.stepName}`}
                          icon={faArrowAltCircleRight}
                          className={styles.reorderFlowRight}
                          role="button"
                          onClick={() => reorderFlow(index, flowName, ReorderFlowOrderDirection.RIGHT)}
                          onKeyDown={(e) => reorderFlowKeyDownHandler(e, index, flowName, ReorderFlowOrderDirection.RIGHT)}
                          tabIndex={0}/>
                      </MLTooltip>
                    }
                  </div>
                </div>
              ]}
              extra={
                <div className={styles.actions}>
                  {props.hasOperatorRole ?
                    step.stepDefinitionType.toLowerCase() === "ingestion" ?
                      <div {...getRootProps()} style={{display: "inline-block"}}>
                        <input {...getInputProps()} id="fileUpload" />
                        <div
                          className={styles.run}
                          aria-label={`runStep-${step.stepName}`}
                          data-testid={"runStep-" + stepNumber}
                          onClick={() => {
                            setShowUploadError(false);
                            setRunningStep(step);
                            setRunningFlow(flowName);
                            openFilePicker();
                          }}
                        >
                          <MLTooltip title={RunToolTips.ingestionStep} placement="bottom">
                            <Icon type="play-circle" theme="filled" />
                          </MLTooltip>
                        </div>
                      </div>
                      :
                      <div
                        className={styles.run}
                        onClick={() => {
                          setShowUploadError(false);
                          props.runStep(flowName, step);
                        }}
                        aria-label={`runStep-${step.stepName}`}
                        data-testid={"runStep-" + stepNumber}
                      >
                        <MLTooltip title={RunToolTips.otherSteps} placement="bottom">
                          <Icon type="play-circle" theme="filled" />
                        </MLTooltip>
                      </div>
                    :
                    <div
                      className={styles.disabledRun}
                      onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}
                      aria-label={"runStepDisabled-" + step.stepName}
                      data-testid={"runStepDisabled-" + stepNumber}
                    >
                      <Icon type="play-circle" theme="filled" />
                    </div>
                  }
                  {props.canWriteFlow ?
                    <MLTooltip title={RunToolTips.removeStep} placement="bottom">
                      <div className={styles.delete} aria-label={`deleteStep-${step.stepName}`} onClick={() => handleStepDelete(flowName, step)}><Icon type="close" /></div>
                    </MLTooltip> :
                    <MLTooltip title={RunToolTips.removeStep} placement="bottom">
                      <div className={styles.disabledDelete} aria-label={`deleteStepDisabled-${step.stepName}`} onClick={(event) => { event.stopPropagation(); event.preventDefault(); }}><Icon type="close" /></div>
                    </MLTooltip>
                  }
                </div>
              }
            >
              <div aria-label={viewStepId + "-content"} className={styles.cardContent}
                onMouseOver={(e) => handleMouseOver(e, viewStepId)}
                onMouseLeave={(e) => setShowLinks("")} >
                {sourceFormat ?
                  <div className={styles.format} style={sourceFormatStyle(sourceFormat)} >{sourceFormatOptions[sourceFormat].label}</div>
                  : null}
                <div className={sourceFormat ? styles.loadStepName : styles.name}>{step.stepName}</div>
                <div className={styles.cardLinks}
                  style={{display: showLinks === viewStepId && step.stepId && authorityByStepType[stepDefinitionType] ? "block" : "none"}}
                  aria-label={viewStepId + "-cardlink"}
                >
                  <Link id={"tiles-step-view-" + viewStepId}
                    to={{
                      pathname: `/tiles/${stepDefinitionType === "ingestion" ? "load" : "curate"}`,
                      state: {
                        stepToView: step.stepId,
                        stepDefinitionType: stepDefinitionType,
                        targetEntityType: step.targetEntityType
                      }
                    }}
                  >
                    <div className={styles.cardLink} data-testid={`${viewStepId}-viewStep`}>View {stepDefinitionTypeTitle} steps</div>
                  </Link>
                </div>
              </div>
              <div className={styles.uploadError}>
                {showUploadError && flowName === runningFlow && stepNumber === runningStep.stepNumber ? props.uploadError : ""}
              </div>
              <div className={styles.running} style={{display: isRunning(flowName, stepNumber) ? "block" : "none"}}>
                <div><MLSpin data-testid="spinner" /></div>
                <div className={styles.runningLabel}>Running...</div>
              </div>
            </Card>
          </div>
        );
      });
      return (
        <Panel header={flowHeader(flowName, i)} key={i} extra={panelActions(flowName, i)} id={flowName} >
          <div className={styles.panelContent} ref={flowPanels[flowName]}>
            {cards}
          </div>
        </Panel>
      );
    });
  }

  //Update activeKeys on Collapse Panel interactions
  const handlePanelInteraction = (key) => {
    /* Request to get latest job info for the flow will be made when someone opens the pane for the first time
        or opens a new pane. Closing the pane shouldn't send any requests*/
    if (!activeKeys || (key.length > activeKeys.length && key.length > 0)) {
      getFlowWithJobInfo(key[key.length - 1]);
    }
    setActiveKeys([...key]);
  };

  const createFlowKeyDownHandler = (event) => {
    if (event.key === "Enter") {
      OpenAddNewDialog();
      event.preventDefault();
    }
  };

  const reorderFlowKeyDownHandler = (event, index, flowName, direction) => {
    if (event.key === "Enter") {
      reorderFlow(index, flowName, direction);
      event.preventDefault();
    }
  };


  return (
    <div id="flows-container" className={styles.flowsContainer}>
      {props.canReadFlow || props.canWriteFlow ?
        <>
          <div className={styles.createContainer}>
            {
              props.canWriteFlow ?
                <span> <MLButton
                  className={styles.createButton} size="default"
                  type="primary" onClick={OpenAddNewDialog} onKeyDown={createFlowKeyDownHandler}
                  aria-label={"create-flow"}
                  tabIndex={0}
                >Create Flow</MLButton></span>
                :
                <MLTooltip title={SecurityTooltips.missingPermission} overlayStyle={{maxWidth: "175px"}}>
                  <span className={styles.disabledCursor}>
                    <MLButton
                      className={styles.createButtonDisabled} size="default"
                      type="primary"
                      disabled={true}
                      aria-label={"create-flow-disabled"}
                      tabIndex={-1}
                    >Create Flow</MLButton>
                  </span>
                </MLTooltip>
            }
          </div>
          <Collapse
            className={styles.collapseFlows}
            activeKey={activeKeys}
            onChange={handlePanelInteraction}
          >
            {panels}
          </Collapse>
          <NewFlowDialog
            newFlow={newFlow || openNewFlow}
            title={title}
            setNewFlow={setNewFlow}
            setAddedFlowName={setAddedFlowName}
            createFlow={props.createFlow}
            createAdd={createAdd}
            updateFlow={props.updateFlow}
            flowData={flowData}
            canWriteFlow={props.canWriteFlow}
            addStepToFlow={props.addStepToFlow}
            newStepToFlowOptions={props.newStepToFlowOptions}
            setOpenNewFlow={setOpenNewFlow}
          />
          {deleteConfirmation}
          {deleteStepConfirmation}
          {addStepConfirmation}
        </> :
        <div></div>
      }
    </div>
  );
};

export default Flows;
