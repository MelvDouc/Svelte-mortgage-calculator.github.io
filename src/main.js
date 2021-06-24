import App from './App.svelte';

const app = new App({
	target: document.body,
	props: {
		pageTitle: "Mortgage Calculator"
	}
});

export default app;