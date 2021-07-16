import React, {useContext, useEffect, useState} from "react";
import styles from "./side-panel.module.scss";
import {MLTooltip} from "@marklogic/design-system";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrashAlt} from "@fortawesome/free-solid-svg-icons";
import {ModelingTooltips} from "../../../../config/tooltips.config";
import {CloseOutlined} from "@ant-design/icons";
import {Menu, Form, Input, Icon} from "antd";
import {ModelingContext} from "../../../../util/modeling-context";
import PropertiesTab from "../properties-tab/properties-tab";
import {primaryEntityTypes, updateModelInfo} from "../../../../api/modeling";
import {UserContext} from "../../../../util/user-context";

type Props = {
  entityTypes: any;
  onCloseSidePanel: () => void;
  deleteEntityClicked: (selectedEntity) => void;
  canWriteEntityModel: any;
  canReadEntityModel: any;
};

const DEFAULT_TAB = "properties";

const GraphViewSidePanel: React.FC<Props> = (props) => {

  const [currentTab, setCurrentTab] = useState(DEFAULT_TAB);
  const {modelingOptions} = useContext(ModelingContext);
  const {handleError} = useContext(UserContext);
  const [selectedEntityDescription, setSelectedEntityDescription] = useState("");
  const [selectedEntityNamespace, setSelectedEntityNamespace] = useState("");
  const [selectedEntityNamespacePrefix, setSelectedEntityNamespacePrefix] = useState("");
  const [errorServer, setErrorServer] = useState("");

  const layout = {
    labelCol: {span: 6},
    wrapperCol: {span: 18},
  };

  const formItemLayout = {
    labelCol: {span: 5},
    wrapperCol: {span: 18}
  };

  const handleTabChange = (item) => {
    setCurrentTab(item.key);
  };

  const getEntityInfo = async () => {
    try {
      const response = await primaryEntityTypes();
      if (response) {
        if (response["data"].length > 0) {
          const entity=modelingOptions.selectedEntity;
          const selectedEntityDetails = await response.data.find(ent => ent.entityName === modelingOptions.selectedEntity);
          setSelectedEntityDescription(entity !== undefined && selectedEntityDetails.model.definitions[entity].description);
          setSelectedEntityNamespace(entity !== undefined && selectedEntityDetails.model.definitions[entity].namespace);
          setSelectedEntityNamespacePrefix(entity !== undefined && selectedEntityDetails.model.definitions[entity].namespacePrefix);
        }
      }
    } catch (error) {
      handleError(error);
    }
  };


  const handlePropertyChange = async (event) => {
    if (event.target.id === "description") {
      setSelectedEntityDescription(event.target.value);
    }
    if (event.target.id === "namespace") {
      setSelectedEntityNamespace(event.target.value);
    }
    if (event.target.id === "prefix") {
      setSelectedEntityNamespacePrefix(event.target.value);
    }
  };

  const handlePropertyUpdate = async (event) => {
    try {
      if (modelingOptions.selectedEntity !== undefined) {
        const response = await updateModelInfo(modelingOptions.selectedEntity, selectedEntityDescription, selectedEntityNamespace, selectedEntityNamespacePrefix);
        if (response["status"] === 200) {
          setErrorServer("");
        }
      }
    } catch (error) {
      if (error.response.status === 400) {
        if (error.response.data.hasOwnProperty("message")) {
          setErrorServer(error["response"]["data"]["message"]);
        }
      } else {
        handleError(error);
      }
    }
  };

  const isErrorOfType = (type: string) => {
    let result = false;
    if (errorServer) {
      if (errorServer.includes("type already exists")) {
        result = type === "name";
      } else if (errorServer.includes("valid absolute URI")) {
        result = type === "namespace";
      } else if (errorServer.includes("prefix without specifying")) {
        result = type === "namespace";
      } else if (errorServer.includes("reserved pattern")) {
        result = type === "namespacePrefix";
      } else if (errorServer.includes("must specify a prefix")) {
        result = type === "namespacePrefix";
      }
    }
    return result;
  };

  useEffect(() => {
    setErrorServer("");
    getEntityInfo();
  }, [modelingOptions.selectedEntity]);

  const displayPanelContent = () => {
    return currentTab === "entityType" ? <div>
      <Form
        {...layout}
      >
        <Form.Item
          className={styles.formItem}
          {...formItemLayout}
          label={<span>
          Name
          </span>} labelAlign="left">
          <span className={styles.entityName} data-testid={modelingOptions.selectedEntity}>{modelingOptions.selectedEntity}</span>
        </Form.Item>
      </Form>
      <Form.Item
        label={<span>Description:</span>}
        {...formItemLayout}
        labelAlign="left"
        className={styles.formItem}
        colon={false}
      >
        <Input
          id="description"
          data-testid="description"
          placeholder="Enter description"
          className={styles.descriptionInput}
          value={selectedEntityDescription}
          onChange={handlePropertyChange}
          onBlur={handlePropertyUpdate}
        />
        <MLTooltip title={ModelingTooltips.entityDescription} placement={"topLeft"}>
          <Icon type="question-circle" className={styles.icon} theme="filled" data-testid="entityDescriptionTooltip"/>
        </MLTooltip>
      </Form.Item>
      <Form.Item
        label="Namespace URI:"
        labelAlign="left"
        style={{marginLeft: 7, marginBottom: 0}}
        {...formItemLayout}
      >
        <Form.Item
          style={{display: "inline-block"}}
          validateStatus={isErrorOfType("namespace") ? "error" : ""}
        >
          <Input
            id="namespace"
            data-testid="namespace"
            placeholder="Example: http://example.org/es/gs"
            className={styles.input}
            value={selectedEntityNamespace}
            onChange={handlePropertyChange}
            onBlur={handlePropertyUpdate}
            style={{width: "8.9vw", marginLeft: "1.5vw"}}
          />
        </Form.Item>
        <span className={styles.prefixLabel}><span style={{marginRight: "1vw"}}>Prefix:</span>
          <Form.Item
            className={styles.formItem}
            colon={false}
            style={{display: "inline-block"}}
            validateStatus={isErrorOfType("namespacePrefix") ? "error" : ""}
          >
            <Input
              id="prefix"
              data-testid="prefix"
              placeholder="Example: esgs"
              className={styles.prefixInput}
              value={selectedEntityNamespacePrefix}
              onChange={handlePropertyChange}
              onBlur={handlePropertyUpdate}
              style={{width: "96px", verticalAlign: "text-bottom"}}
            />
            <MLTooltip title={ModelingTooltips.namespace} placement={"right"}>
              <Icon type="question-circle" className={styles.prefixTooltipIcon} theme="filled" data-testid="entityPrefixTooltip"/>
            </MLTooltip>
          </Form.Item></span>
        { errorServer ? <p className={styles.errorServer}>{errorServer}</p> : null }
      </Form.Item>
    </div>
      :
      <PropertiesTab
        entityTypeData={props.entityTypes.find(e => e.entityName === modelingOptions.selectedEntity)}
        canWriteEntityModel={props.canWriteEntityModel}
        canReadEntityModel={props.canReadEntityModel}
      />;
  };

  return (
    <div id="sidePanel" className={styles.sidePanel}>
      <div>
        <span className={styles.selectedEntityHeading} aria-label={`${modelingOptions.selectedEntity}-selectedEntity`}>{modelingOptions.selectedEntity}</span>
        <span><MLTooltip title={ModelingTooltips.deleteIcon} placement="top">
          <i key="last" role="delete-entity button" data-testid={modelingOptions.selectedEntity + "-delete"} onClick={() => props.deleteEntityClicked(modelingOptions.selectedEntity)}>
            <FontAwesomeIcon icon={faTrashAlt} className={styles.deleteIcon} size="lg" />
          </i>
        </MLTooltip></span>
        <span><i className={styles.close} aria-label={"closeGraphViewSidePanel"}
          onClick={props.onCloseSidePanel}>
          <CloseOutlined />
        </i></span>
      </div>
      <div className={styles.tabs}>
        <Menu mode="horizontal" defaultSelectedKeys={[DEFAULT_TAB]} selectedKeys={[currentTab]} onClick={handleTabChange}>
          <Menu.Item key="properties" aria-label="propertiesTabInSidePanel">
            {<span className={styles.sidePanelTabLabel}>Properties</span>}
          </Menu.Item>
          <Menu.Item key="entityType" aria-label="entityTypeTabInSidePanel">
            {<span className={styles.sidePanelTabLabel}>Entity Type</span>}
          </Menu.Item>
        </Menu>
      </div>
      {displayPanelContent()}
    </div>
  );
};

export default GraphViewSidePanel;