import "@testing-library/jest-dom/vitest";

if (!window.URL.createObjectURL) {
	window.URL.createObjectURL = () => "blob:mock";
}

if (!HTMLCanvasElement.prototype.getContext) {
	HTMLCanvasElement.prototype.getContext = () => null;
}
