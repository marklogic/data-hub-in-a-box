import React, { useState, useEffect } from "react";
import Graph from "react-graph-vis";
import "./graph-vis.scss";
import ReactDOMServer from "react-dom/server";
import { faFileExport, faTrashAlt, faAddressBook, faAmbulance } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import NodeSvg from "./node-svg";

type Props = {
  entityTypes: any;
  handleEntitySelection: any;
};

const GraphVis: React.FC<Props> = (props) => {

  const [nodePositions, setNodePositions] = useState({});
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });

  //Initializing network instance
  const [network, setNetwork] = useState<any>(null);
  const initNetworkInstance = (networkInstance) => {
    setNetwork(networkInstance)
  }
  const [hoveringNode, setHoveringNode] = useState<string | undefined>(undefined);

  // Initialize graph after async loading of entity data
  useEffect(() => {
    setGraphData({
      nodes: getNodesAsImages(),
      edges: getEdges()
    });
  }, [props.entityTypes]);

  //Use these to set specific positions for entity nodes temporarily
  let nodeP = {
    BabyRegistry: {
      x: 134.5, y: -165
    },
    Customer: {
      x: -1.8683534551792256, y: -13.817459136071609
    },
    Product: {
      x: -290.5, y: -57
    },
    Order: {
      x: 311.5, y: 1
    },
    NamespacedCustomer: {
      x: -193.56170318899566, y: 27.318452823974837
    },
    Person: {
      x: -143.5, y: -143
    }
  }

  let entityMetadata = {
    BabyRegistry: {
      color: "#e3ebbc",
      instances: 5,
      icon: <FontAwesomeIcon icon={faFileExport} aria-label="BabyRegistry-icon" />
    },
    Customer: {
      color: "#ecf7fd",
      instances: 63,
      icon: <FontAwesomeIcon icon={faTrashAlt} aria-label="graph-export" />
    },
    Product: {
      color: "#ded2da",
      instances: 252,
      icon: <FontAwesomeIcon icon={faTrashAlt} aria-label="graph-export" />
    },
    Order: {
      color: "#cfe3e8",
      instances: 50123,
      icon: <FontAwesomeIcon icon={faTrashAlt} aria-label="graph-export" />
    },
    NamespacedCustomer: {
      color: "#dfe2ec",
      instances: 75,
      icon: <FontAwesomeIcon icon={faAddressBook} aria-label="graph-export" />
    },
    Person: {
      color: "#dfe2ec",
      instances: 75,
      icon: <FontAwesomeIcon icon={faAmbulance} aria-label="graph-export" />
    }
  };

  const getLabelIcon = (entityName) => {
    let icon = entityMetadata[entityName].icon;
    return ReactDOMServer.renderToString(icon);
  }

  const getEncodedSvg = (entityName) => {
    let svgImage = `<svg class="box" width="550" height="170" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <style type="text/css">
    @namespace svg url(http://www.w3.org/2000/svg);
    svg|a:link, svg|a:visited {
      cursor: pointer;
    }
    
    svg|a text,
    text svg|a {
      fill: blue; /* Even for text, SVG uses fill over color */
    }
    .box{
      fill: ${hoveringNode === entityName ? "#E9F7FE" : entityMetadata[entityName].color};
    }
    .instances{
      font-family: Arial, Helvetica, sans-serif;
      font-size: 40px;
      fill: #6773af;
      width: 100%;
    }
    .label{
      font-family: Arial, Helvetica, sans-serif;
      font-size: 40px;
      font-weight: 600;
      color: #333;
      width: 100%;
      word-wrap: break-word;
    }
    <![CDATA[
    .customIcon{
      color: black;
      font-size: 24px;
    };
    ]]>
    </style>
      <rect x="0px" y="0px" width="100%" height="100%" rx="4px"/>
      <foreignObject x="100" y="120" width="180" height="200" class="customIcon" transform="translate(2,8) scale(0.20,0.20)">
      ${getLabelIcon(entityName)}
      </foreignObject>
      <foreignObject x="80" y="30" width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml" class="label">
      ${entityName}
      </div>
      </foreignObject>
      <a id="alink" xlink:href="https://www.google.com" target="_top">
      <text x="20" y="120" class="instances">${entityMetadata[entityName].instances}</text>
      </a>
</svg>`

    return encodeURIComponent(svgImage);
  }
  const getNodeImage = (entityName) => {
    //var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ReactDOMServer.renderToString(getNodeSVGJSX(entityName)));//getEncodedSvg(e);
    const node = new NodeSvg(entityName, entityMetadata[entityName].color, entityMetadata[entityName].instances, getLabelIcon(entityName));
    //var url = "data:image/svg+xml;charset=utf-8," + getEncodedSvg(entityName);
    var url = "data:image/svg+xml;charset=utf-8," + node.getNode();
    return url;
  }

  const getNodesAsImages = () => {
    let nodesTemp = props.entityTypes && props.entityTypes?.map((e) => {
      return {
        id: e.entityName,
        label: "",
        title: e.model.definitions[e.entityName].description ? e.model.definitions[e.entityName].description : "Description is not available for the entity",
        image: getNodeImage(e.entityName),
        shape: "image"
      }
    });
    return nodesTemp;
  }

  const getEdges = () => {
    let edges: any = [];
    props.entityTypes.forEach((e, i) => {
      let properties: any = Object.keys(e.model.definitions[e.entityName].properties);
      properties.forEach((p, i) => {
        if (e.model.definitions[e.entityName].properties[p].relatedEntityType) {
          let parts = e.model.definitions[e.entityName].properties[p].relatedEntityType.split("/");
          edges.push({
            from: e.entityName,
            to: parts[parts.length - 1],
            label: e.model.definitions[e.entityName].properties[p].joinPropertyName,
            arrows: "to",
            color: "#666",
            font: { align: "top" }
          });
        }
      });
    });
    return edges;
  }

  const options = {
    layout: {
      //hierarchical: true
      //randomSeed: "0.7696:1625099255200",
    },
    edges: {
      color: "#000000"
    },
    height: "500px",
    physics: {
      enabled: physicsEnabled,
      barnesHut: {
        springLength: 160,
        avoidOverlap: 0.4
      }
    },
    interaction: {
      hover: true
    },
    manipulation: {
      enabled: false,
      addNode: function (data, callback) {
        // filling in the popup DOM elements
        console.log('add', data);
      },
      editNode: function (data, callback) {
        // filling in the popup DOM elements
        console.log('edit', data);
      },
      addEdge: function (data, callback) {
        //   console.log('add edge', data);
      }
    }
  };

  const events = {
    select: (event) => {
      var { nodes, edges } = event;
      console.log('select', nodes, event);
      if (nodes.length > 0) {
        props.handleEntitySelection(nodes[0]);
      }
    },
    dragStart: (event) => {
      if (physicsEnabled) {
        setPhysicsEnabled(false);
      }
    },
    dragEnd: (event) => {
      console.log('dragEnd', event, event.pointer.canvas);
      setNodePositions({ [event.nodes[0]]: event.pointer.canvas })
    },
    hoverNode: (event) => {
      console.log('on hover node', event);
      event.event.target.style.cursor = "pointer"
      setHoveringNode(event.node);
    },
    blurNode: (event) => {
      console.log('on blur node', event);
      event.event.target.style.cursor = ""
      setHoveringNode(undefined);
    },
    hoverEdge: (event) => {
      console.log('on hover edge', event.event.target.style.cursor);
      event.event.target.style.cursor = "pointer"
    },
    blurEdge: (event) => {
      console.log('on blur edge', event);
      event.event.target.style.cursor = ""
    },
    doubleClick: (event) => {
      console.log('doubleClick', event);
    }
  };

  return (
    <div id="graphVis">
      <Graph
        graph={graphData}
        options={options}
        events={events}
        getNetwork={initNetworkInstance}
      />
    </div>
  );
};

export default GraphVis;