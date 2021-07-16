// TODO convert into JSX component that displays SVG: 
// https://betterprogramming.pub/create-react-app-and-svgs-70970ac715f2
export default class NodeSvg {
    constructor(name, color, numInstances, icon) {
      this.name = name;
      this.color = color;
      this.numInstances = numInstances;
      this.icon = icon;
    }
  
    getNode = () => {
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
            fill: ${this.color};
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
            ${this.icon}
          </foreignObject>
          <foreignObject x="80" y="30" width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" class="label">
              ${this.name}
            </div>
          </foreignObject>
          <a id="alink" xlink:href="https://www.google.com" target="_top">
            <text x="20" y="120" class="instances">${this.numInstances}</text>
          </a>
      </svg>`
      return encodeURIComponent(svgImage);
    }

  }