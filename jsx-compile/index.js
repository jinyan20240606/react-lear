import React from 'react';
import ReactDOM from 'react-dom/client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const App = /*#__PURE__*/_jsx("h1", {
  onClick: () => {},
  children: "this is a H1 Tag"
});
function FnComp() {
  return /*#__PURE__*/_jsx("div", {
    jsx11: /*#__PURE__*/_jsx("div", {}),
    children: "A Function Component"
  });
}
class ClassComp extends React.Component {
  render() {
    return /*#__PURE__*/_jsxs("div", {
      children: [/*#__PURE__*/_jsx("h1", {
        children: "A Class Component"
      }), /*#__PURE__*/_jsx(FnComp, {})]
    });
  }
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/_jsx(App, {}));
