import React, {useState, useEffect, useContext, CSSProperties} from "react";
import {faProjectDiagram, faSave, faTable, faUndo} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {MLButton, MLTooltip, MLAlert, MLRadio} from "@marklogic/design-system";
import "./Modeling.scss";

import ConfirmationModal from "../components/confirmation-modal/confirmation-modal";
import EntityTypeModal from "../components/modeling/entity-type-modal/entity-type-modal";
import EntityTypeTable from "../components/modeling/entity-type-table/entity-type-table";
import styles from "./Modeling.module.scss";

import {primaryEntityTypes, updateEntityModels} from "../api/modeling";
import {UserContext} from "../util/user-context";
import {ModelingContext} from "../util/modeling-context";
import {ModelingTooltips} from "../config/tooltips.config";
import {AuthoritiesContext} from "../util/authorities";
import {EntityModified} from "../types/modeling-types";
import {ConfirmationType} from "../types/common-types";
import tiles from "../config/tiles.config";
import {MissingPagePermission} from "../config/messages.config";
import {faLayerGroup, faKey} from "@fortawesome/free-solid-svg-icons";
import arrayIcon from "../assets/icon_array.png";
import relatedEntityIcon from "../assets/icon_related_entities.png";
import GraphView from "../components/modeling/graph-view/graph-view";
import {defaultModelingView} from "../config/modeling.config";

const Modeling: React.FC = () => {
  const {handleError} = useContext(UserContext);
  const {modelingOptions, setEntityTypeNamesArray, clearEntityModified, setView} = useContext(ModelingContext);
  const [entityTypes, setEntityTypes] = useState<any[]>([]);
  const [showEntityModal, toggleShowEntityModal] = useState(false);
  const [isEditModal, toggleIsEditModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [namespace, setNamespace] = useState("");
  const [prefix, setPrefix] = useState("");
  const [autoExpand, setAutoExpand] = useState("");
  const [revertAllEntity, toggleRevertAllEntity] = useState(false);
  const [width, setWidth] = React.useState(window.innerWidth);

  const [showConfirmModal, toggleConfirmModal] = useState(false);
  const [confirmType, setConfirmType] = useState<ConfirmationType>(ConfirmationType.SaveAll);

  //Role based access
  const authorityService = useContext(AuthoritiesContext);
  const canReadEntityModel = authorityService.canReadEntityModel();
  const canWriteEntityModel = authorityService.canWriteEntityModel();
  const canAccessModel = authorityService.canAccessModel();

  useEffect(() => {
    if (canReadEntityModel && modelingOptions.view === "table") {
      setEntityTypesFromServer();
    }
  }, [modelingOptions.view]);

  useEffect(() => {
    if (canReadEntityModel) {
      setEntityTypesFromServer();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateWidthAndHeight);
    return () => window.removeEventListener("resize", updateWidthAndHeight);
  });

  const updateWidthAndHeight = () => {
    setWidth(window.innerWidth);
  };

  const setEntityTypesFromServer = async () => {
    try {
      const response = await primaryEntityTypes();

      if (response) {
        setEntityTypes(response["data"]);
        if (response["data"].length > 0) {
          setEntityTypeNamesArray(response["data"].map(entity => {
            return {name: entity.entityName, entityTypeId: entity.entityTypeId};
          }));
        }
      }
    } catch (error) {
      handleError(error);
    }
  };

  const saveAllEntitiesToServer = async () => {
    try {
      const response = await updateEntityModels(modelingOptions.modifiedEntitiesArray);
      if (response["status"] === 200) {
        await setEntityTypesFromServer();
      }
    } catch (error) {
      handleError(error);
    } finally {
      clearEntityModified();
      toggleConfirmModal(false);
    }
  };

  const updateSavedEntity = (entity: EntityModified) => {
    let updatedEntityTypes = [...entityTypes];
    let updateEntityIndex = updatedEntityTypes.findIndex((entityType) => entityType.entityName === entity.entityName);

    updatedEntityTypes[updateEntityIndex]["model"]["definitions"] = entity.modelDefinition;
    setEntityTypes(updatedEntityTypes);
  };

  const updateEntityTypesAndHideModal = async (entityName: string, description: string) => {
    if (!isEditModal) {
      setAutoExpand(entityName);
    }
    toggleShowEntityModal(false);
    await setEntityTypesFromServer();
  };

  const editEntityTypeDescription = (entityTypeName: string, entityTypeDescription: string, entityTypeNamespace: string, entityTypePrefix: string) => {
    if (canWriteEntityModel) {
      toggleIsEditModal(true);
      toggleShowEntityModal(true);
      setName(entityTypeName);
      setDescription(entityTypeDescription);
      setNamespace(entityTypeNamespace);
      setPrefix(entityTypePrefix);
    }
  };

  const confirmAction = () => {
    if (confirmType === ConfirmationType.SaveAll) {
      saveAllEntitiesToServer();
    } else if (confirmType === ConfirmationType.RevertAll) {
      resetAllEntityTypes();
    }
  };

  const resetAllEntityTypes = async () => {
    await setEntityTypesFromServer();
    clearEntityModified();
    toggleRevertAllEntity(true);
    toggleConfirmModal(false);
  };

  const addButton = <MLButton
    type="primary"
    aria-label="add-entity"
    onClick={() => {
      toggleIsEditModal(false);
      toggleShowEntityModal(true);
    }}
    disabled={!canWriteEntityModel}
    className={!canWriteEntityModel && styles.disabledPointerEvents}
  >Add</MLButton>;

  const saveAllButton = <MLButton
    className={!modelingOptions.isModified ? styles.disabledPointerEvents : ""}
    disabled={!modelingOptions.isModified}
    aria-label="save-all"
    onClick={() => {
      setConfirmType(ConfirmationType.SaveAll);
      toggleConfirmModal(true);
    }}
  >
    <FontAwesomeIcon
      icon={faSave}
      className={styles.publishIcon}
      size="sm"
    />
        Save All
  </MLButton>;

  const revertAllButton = <MLButton
    className={!modelingOptions.isModified ? styles.disabledPointerEvents : ""}
    disabled={!modelingOptions.isModified}
    aria-label="revert-all"
    onClick={() => {
      setConfirmType(ConfirmationType.RevertAll);
      toggleConfirmModal(true);
    }}
  >
    <FontAwesomeIcon
      className={styles.icon}
      icon={faUndo}
      size="sm"
    />
        Revert All
  </MLButton>;

  const handleViewChange = (view) => {
    if (view === "table") {
      setView("table");
    } else {
      setView(defaultModelingView);
    }
  };

  const mlRadioStyle: CSSProperties = {
    color: "#999"
  };

  const viewSwitch = <div id="switch-view" aria-label="switch-view">
    <MLRadio.MLGroup
      buttonStyle="outline"
      className={"radioGroupView"}
      defaultValue={modelingOptions.view}
      name="radiogroup"
      onChange={e => handleViewChange(e.target.value)}
      size="large"
      style={mlRadioStyle}
      tabIndex={0}
    >
      <MLRadio.MLButton aria-label="switch-view-graph" value={"graph"} checked={modelingOptions.view === "graph"}>
        <i>{<FontAwesomeIcon icon={faProjectDiagram}/>}</i>
      </MLRadio.MLButton>
      <MLRadio.MLButton aria-label="switch-view-table" value={"table"} checked={modelingOptions.view === "table"}>
        <i>{<FontAwesomeIcon icon={faTable}/>}</i>
      </MLRadio.MLButton>
    </MLRadio.MLGroup>
  </div>;

  if (canAccessModel) {
    return (
      <div className={styles.modelContainer}>
        {modelingOptions.view === "table" ?
          <div className={styles.stickyHeader} style={{width: width - 138, maxWidth: width - 138}}>
            <div className={styles.intro}>
              <p>{tiles.model.intro}</p>
              {viewSwitch}
            </div>
            {modelingOptions.isModified && (
              <div className={modelingOptions.isModified ? styles.alertContainer : ""}><MLAlert
                type="info" aria-label="entity-modified-alert" showIcon
                message={ModelingTooltips.entityEditedAlert}/></div>
            )}
            <div>
              <div className={styles.header}>
                <h1>Entity Types</h1>
                <div className={styles.buttonContainer}>
                  <div className={styles.legend}>
                    <div data-testid="foreignKeyIconLegend" className={styles.legendText}>
                      <FontAwesomeIcon className={styles.foreignKeyIcon} icon={faKey}/> Foreign
                                            Key Relationship
                    </div>
                    <div data-testid="relatedEntityIconLegend" className={styles.legendText}><img
                      className={styles.relatedIcon} src={relatedEntityIcon} alt={""}/> Related
                                            Entity
                    </div>
                    <div data-testid="multipleIconLegend" className={styles.legendText}><img
                      className={styles.arrayImage} src={arrayIcon} alt={""}/> Multiple
                    </div>
                    <div data-testid="structuredIconLegend" className={styles.legendText}>
                      <FontAwesomeIcon className={styles.structuredIcon}
                        icon={faLayerGroup}/> Structured Type
                    </div>
                  </div>
                  <div style={{float: "right"}}>
                    {canWriteEntityModel ?
                      <MLTooltip title={ModelingTooltips.addNewEntity}>
                        {addButton}
                      </MLTooltip>
                      :
                      <MLTooltip
                        title={ModelingTooltips.addNewEntity + " " + ModelingTooltips.noWriteAccess}
                        placement="top" overlayStyle={{maxWidth: "175px"}}>
                        <span className={styles.disabledCursor}>{addButton}</span>
                      </MLTooltip>
                    }
                    {canWriteEntityModel ?
                      <MLTooltip title={ModelingTooltips.saveAll}
                        overlayStyle={{maxWidth: "175px"}}>
                        <span
                          className={modelingOptions.isModified ? styles.CursorButton : styles.disabledCursor}>{saveAllButton}</span>
                      </MLTooltip>
                      :
                      <MLTooltip
                        title={ModelingTooltips.saveAll + " " + ModelingTooltips.noWriteAccess}
                        placement="top" overlayStyle={{maxWidth: "225px"}}>
                        <span className={styles.disabledCursor}>{saveAllButton}</span>
                      </MLTooltip>
                    }
                    {canWriteEntityModel ?
                      <MLTooltip title={ModelingTooltips.revertAll}
                        overlayStyle={{maxWidth: "175px"}}>
                        <span
                          className={modelingOptions.isModified ? styles.CursorButton : styles.disabledCursor}>{revertAllButton}</span>
                      </MLTooltip>
                      :
                      <MLTooltip
                        title={ModelingTooltips.revertAll + " " + ModelingTooltips.noWriteAccess}
                        placement="left" overlayStyle={{maxWidth: "250px"}}>
                        <span className={styles.disabledCursor}>{revertAllButton}</span>
                      </MLTooltip>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div> : <>
            <div className={styles.intro}>
              <p>{tiles.model.intro}</p>
              {viewSwitch}
            </div>
            {modelingOptions.isModified && (
              <div className={modelingOptions.isModified ? styles.alertContainer : ""}><MLAlert
                type="info" aria-label="entity-modified-alert" showIcon
                message={ModelingTooltips.entityEditedAlert}/></div>
            )}
            <h1>Entity Types</h1>
            <div className={styles.borderBelowHeader}></div>
            <GraphView
              canReadEntityModel={canReadEntityModel}
              canWriteEntityModel={canWriteEntityModel}
              entityTypes={entityTypes}
            />
          </>
        }
        {modelingOptions.view === "table" ? <div
          className={modelingOptions.isModified ? styles.entityTableContainer : styles.entityTableContainerWithoutAlert}>
          <EntityTypeTable
            canReadEntityModel={canReadEntityModel}
            canWriteEntityModel={canWriteEntityModel}
            allEntityTypesData={entityTypes}
            editEntityTypeDescription={editEntityTypeDescription}
            updateEntities={setEntityTypesFromServer}
            updateSavedEntity={updateSavedEntity}
            autoExpand={autoExpand}
            revertAllEntity={revertAllEntity}
            toggleRevertAllEntity={toggleRevertAllEntity}
          />
        </div> : ""}
        <ConfirmationModal
          isVisible={showConfirmModal}
          type={confirmType}
          boldTextArray={[]}
          arrayValues={[]}
          toggleModal={toggleConfirmModal}
          confirmAction={confirmAction}
        />
        <EntityTypeModal
          isVisible={showEntityModal}
          toggleModal={toggleShowEntityModal}
          updateEntityTypesAndHideModal={updateEntityTypesAndHideModal}
          isEditModal={isEditModal}
          name={name}
          description={description}
          namespace={namespace}
          prefix={prefix}
        />
      </div>
    );
  } else {
    return (
      <div className={styles.modelContainer}>
        <p>{MissingPagePermission}</p>
      </div>
    );
  }
};

export default Modeling;
