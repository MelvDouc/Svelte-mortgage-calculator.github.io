var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached
        const children = target.childNodes;
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            const seqLen = upper_bound(1, longest + 1, idx => children[m[idx]].claim_order, current) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentElement !== target))) {
                target.actual_end_child = target.firstChild;
            }
            if (node !== target.actual_end_child) {
                target.insertBefore(node, target.actual_end_child);
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append(target, node);
        }
        else if (node.parentNode !== target || (anchor && node.nextSibling !== anchor)) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function to_number(value) {
        return value === '' ? null : +value;
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    class HtmlTag {
        constructor(claimed_nodes) {
            this.e = this.n = null;
            this.l = claimed_nodes;
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                this.e = element(target.nodeName);
                this.t = target;
                if (this.l) {
                    this.n = this.l;
                }
                else {
                    this.h(html);
                }
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : options.context || []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\App.svelte generated by Svelte v3.38.3 */

    function create_fragment(ctx) {
    	let title_value;
    	let t0;
    	let main;
    	let div0;
    	let h1;
    	let t1;
    	let t2;
    	let div1;
    	let label0;
    	let t4;
    	let input0;
    	let t5;
    	let div4;
    	let div2;
    	let label1;
    	let t7;
    	let input1;
    	let t8;
    	let div3;
    	let t9;
    	let t10;
    	let t11_value = (/*years*/ ctx[2] > 1 ? "s" : "") + "";
    	let t11;
    	let t12;
    	let div7;
    	let div5;
    	let label2;
    	let t14;
    	let input2;
    	let t15;
    	let div6;
    	let t16_value = /*interestRate*/ ctx[4].toFixed(2) + "";
    	let t16;
    	let html_tag;
    	let raw_value = "&nbsp;" + "";
    	let t17;
    	let t18;
    	let div8;
    	let t19;
    	let t20_value = formatAmount(/*monthlyPayment*/ ctx[5]) + "";
    	let t20;
    	let t21;
    	let div9;
    	let t22;
    	let t23_value = formatAmount(/*totalPaid*/ ctx[6]) + "";
    	let t23;
    	let t24;
    	let div10;
    	let t25;
    	let t26_value = formatAmount(/*interestPaid*/ ctx[7]) + "";
    	let t26;
    	let mounted;
    	let dispose;
    	document.title = title_value = /*pageTitle*/ ctx[0];

    	return {
    		c() {
    			t0 = space();
    			main = element("main");
    			div0 = element("div");
    			h1 = element("h1");
    			t1 = text(/*pageTitle*/ ctx[0]);
    			t2 = space();
    			div1 = element("div");
    			label0 = element("label");
    			label0.textContent = "Loan Amount";
    			t4 = space();
    			input0 = element("input");
    			t5 = space();
    			div4 = element("div");
    			div2 = element("div");
    			label1 = element("label");
    			label1.textContent = "Years";
    			t7 = space();
    			input1 = element("input");
    			t8 = space();
    			div3 = element("div");
    			t9 = text(/*years*/ ctx[2]);
    			t10 = text(" year");
    			t11 = text(t11_value);
    			t12 = space();
    			div7 = element("div");
    			div5 = element("div");
    			label2 = element("label");
    			label2.textContent = "Interest Rate";
    			t14 = space();
    			input2 = element("input");
    			t15 = space();
    			div6 = element("div");
    			t16 = text(t16_value);
    			html_tag = new HtmlTag();
    			t17 = text("%");
    			t18 = space();
    			div8 = element("div");
    			t19 = text("Monthly Payments: ");
    			t20 = text(t20_value);
    			t21 = space();
    			div9 = element("div");
    			t22 = text("Total Paid: ");
    			t23 = text(t23_value);
    			t24 = space();
    			div10 = element("div");
    			t25 = text("Interest Paid: ");
    			t26 = text(t26_value);
    			attr(h1, "class", "svelte-16yv3au");
    			attr(div0, "class", "row");
    			attr(label0, "for", "");
    			attr(input0, "type", "number");
    			attr(input0, "min", "1");
    			attr(input0, "class", "u-full-width");
    			attr(input0, "placeholder", "Enter loan amount");
    			attr(div1, "class", "row");
    			attr(label1, "for", "");
    			attr(input1, "type", "range");
    			attr(input1, "min", "1");
    			attr(input1, "max", "50");
    			attr(input1, "class", "u-full-width");
    			attr(div2, "class", "columns six");
    			attr(div3, "class", "columns six outputs svelte-16yv3au");
    			attr(div4, "class", "row");
    			attr(label2, "for", "");
    			attr(input2, "type", "range");
    			attr(input2, "min", "0");
    			attr(input2, "max", "2000");
    			attr(input2, "step", "10");
    			attr(input2, "class", "u-full-width");
    			attr(div5, "class", "columns six");
    			html_tag.a = t17;
    			attr(div6, "class", "columns six outputs svelte-16yv3au");
    			attr(div7, "class", "row");
    			attr(div8, "class", "row outputs svelte-16yv3au");
    			attr(div9, "class", "row outputs svelte-16yv3au");
    			attr(div10, "class", "row outputs svelte-16yv3au");
    			attr(main, "class", "container");
    		},
    		m(target, anchor) {
    			insert(target, t0, anchor);
    			insert(target, main, anchor);
    			append(main, div0);
    			append(div0, h1);
    			append(h1, t1);
    			append(main, t2);
    			append(main, div1);
    			append(div1, label0);
    			append(div1, t4);
    			append(div1, input0);
    			set_input_value(input0, /*loanAmount*/ ctx[1]);
    			append(main, t5);
    			append(main, div4);
    			append(div4, div2);
    			append(div2, label1);
    			append(div2, t7);
    			append(div2, input1);
    			set_input_value(input1, /*years*/ ctx[2]);
    			append(div4, t8);
    			append(div4, div3);
    			append(div3, t9);
    			append(div3, t10);
    			append(div3, t11);
    			append(main, t12);
    			append(main, div7);
    			append(div7, div5);
    			append(div5, label2);
    			append(div5, t14);
    			append(div5, input2);
    			set_input_value(input2, /*interestRateInput*/ ctx[3]);
    			append(div7, t15);
    			append(div7, div6);
    			append(div6, t16);
    			html_tag.m(raw_value, div6);
    			append(div6, t17);
    			append(main, t18);
    			append(main, div8);
    			append(div8, t19);
    			append(div8, t20);
    			append(main, t21);
    			append(main, div9);
    			append(div9, t22);
    			append(div9, t23);
    			append(main, t24);
    			append(main, div10);
    			append(div10, t25);
    			append(div10, t26);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*input0_input_handler*/ ctx[11]),
    					listen(input1, "change", /*input1_change_input_handler*/ ctx[12]),
    					listen(input1, "input", /*input1_change_input_handler*/ ctx[12]),
    					listen(input2, "change", /*input2_change_input_handler*/ ctx[13]),
    					listen(input2, "input", /*input2_change_input_handler*/ ctx[13])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*pageTitle*/ 1 && title_value !== (title_value = /*pageTitle*/ ctx[0])) {
    				document.title = title_value;
    			}

    			if (dirty & /*pageTitle*/ 1) set_data(t1, /*pageTitle*/ ctx[0]);

    			if (dirty & /*loanAmount*/ 2 && to_number(input0.value) !== /*loanAmount*/ ctx[1]) {
    				set_input_value(input0, /*loanAmount*/ ctx[1]);
    			}

    			if (dirty & /*years*/ 4) {
    				set_input_value(input1, /*years*/ ctx[2]);
    			}

    			if (dirty & /*years*/ 4) set_data(t9, /*years*/ ctx[2]);
    			if (dirty & /*years*/ 4 && t11_value !== (t11_value = (/*years*/ ctx[2] > 1 ? "s" : "") + "")) set_data(t11, t11_value);

    			if (dirty & /*interestRateInput*/ 8) {
    				set_input_value(input2, /*interestRateInput*/ ctx[3]);
    			}

    			if (dirty & /*interestRate*/ 16 && t16_value !== (t16_value = /*interestRate*/ ctx[4].toFixed(2) + "")) set_data(t16, t16_value);
    			if (dirty & /*monthlyPayment*/ 32 && t20_value !== (t20_value = formatAmount(/*monthlyPayment*/ ctx[5]) + "")) set_data(t20, t20_value);
    			if (dirty & /*totalPaid*/ 64 && t23_value !== (t23_value = formatAmount(/*totalPaid*/ ctx[6]) + "")) set_data(t23, t23_value);
    			if (dirty & /*interestPaid*/ 128 && t26_value !== (t26_value = formatAmount(/*interestPaid*/ ctx[7]) + "")) set_data(t26, t26_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(t0);
    			if (detaching) detach(main);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function formatAmount(amount) {
    	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
    }

    function instance($$self, $$props, $$invalidate) {
    	let interestRate;
    	let totalPayments;
    	let monthlyInterestRate;
    	let calculatedInterest;
    	let monthlyPayment;
    	let totalPaid;
    	let interestPaid;
    	let { pageTitle } = $$props;
    	let loanAmount = 10000;
    	let years = 12;
    	let interestRateInput = 100;

    	function input0_input_handler() {
    		loanAmount = to_number(this.value);
    		$$invalidate(1, loanAmount);
    	}

    	function input1_change_input_handler() {
    		years = to_number(this.value);
    		$$invalidate(2, years);
    	}

    	function input2_change_input_handler() {
    		interestRateInput = to_number(this.value);
    		$$invalidate(3, interestRateInput);
    	}

    	$$self.$$set = $$props => {
    		if ("pageTitle" in $$props) $$invalidate(0, pageTitle = $$props.pageTitle);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*interestRateInput*/ 8) {
    			$$invalidate(4, interestRate = interestRateInput / 100);
    		}

    		if ($$self.$$.dirty & /*years*/ 4) {
    			$$invalidate(8, totalPayments = years * 12);
    		}

    		if ($$self.$$.dirty & /*interestRate*/ 16) {
    			$$invalidate(9, monthlyInterestRate = interestRate / 100 / 12);
    		}

    		if ($$self.$$.dirty & /*monthlyInterestRate, totalPayments*/ 768) {
    			$$invalidate(10, calculatedInterest = Math.pow(monthlyInterestRate + 1, totalPayments));
    		}

    		if ($$self.$$.dirty & /*loanAmount, calculatedInterest, monthlyInterestRate*/ 1538) {
    			$$invalidate(5, monthlyPayment = loanAmount * calculatedInterest * monthlyInterestRate / (calculatedInterest - 1));
    		}

    		if ($$self.$$.dirty & /*totalPayments, monthlyPayment*/ 288) {
    			$$invalidate(6, totalPaid = totalPayments * monthlyPayment);
    		}

    		if ($$self.$$.dirty & /*totalPaid, loanAmount*/ 66) {
    			$$invalidate(7, interestPaid = totalPaid - loanAmount);
    		}
    	};

    	return [
    		pageTitle,
    		loanAmount,
    		years,
    		interestRateInput,
    		interestRate,
    		monthlyPayment,
    		totalPaid,
    		interestPaid,
    		totalPayments,
    		monthlyInterestRate,
    		calculatedInterest,
    		input0_input_handler,
    		input1_change_input_handler,
    		input2_change_input_handler
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { pageTitle: 0 });
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		pageTitle: "Mortgage Calculator"
    	}
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
