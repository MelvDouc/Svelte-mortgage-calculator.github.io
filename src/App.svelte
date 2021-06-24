<script>
	export let pageTitle;
	let loanAmount = 10_000;
	let years = 12;
	let interestRateInput = 100;
	$: interestRate = interestRateInput / 100;
	$: totalPayments = years * 12;
	$: monthlyInterestRate = interestRate / 100 / 12;
	$: calculatedInterest = Math.pow(monthlyInterestRate + 1, totalPayments);
	$: monthlyPayment =
		(loanAmount * calculatedInterest * monthlyInterestRate) /
		(calculatedInterest - 1);
	$: totalPaid = totalPayments * monthlyPayment;
	$: interestPaid = totalPaid - loanAmount;

	function formatAmount(amount) {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(amount);
	}
</script>

<svelte:head>
	<title>{pageTitle}</title>
</svelte:head>

<main class="container">
	<div class="row">
		<h1>{pageTitle}</h1>
	</div>
	<div class="row">
		<label for="">Loan Amount</label>
		<input
			type="number"
			min="1"
			class="u-full-width"
			placeholder="Enter loan amount"
			bind:value={loanAmount}
		/>
	</div>
	<div class="row">
		<div class="columns six">
			<label for="">Years</label>
			<input
				type="range"
				min="1"
				max="50"
				class="u-full-width"
				bind:value={years}
			/>
		</div>
		<div class="columns six outputs">{years} year{years > 1 ? "s" : ""}</div>
	</div>
	<div class="row">
		<div class="columns six">
			<label for="">Interest Rate</label>
			<input
				type="range"
				min="0"
				max="2000"
				step="10"
				class="u-full-width"
				bind:value={interestRateInput}
			/>
		</div>
		<div class="columns six outputs">
			{interestRate.toFixed(2)}{@html "&nbsp;"}%
		</div>
	</div>
	<div class="row outputs">
		Monthly Payments: {formatAmount(monthlyPayment)}
	</div>
	<div class="row outputs">Total Paid: {formatAmount(totalPaid)}</div>
	<div class="row outputs">Interest Paid: {formatAmount(interestPaid)}</div>
</main>

<style>
	h1 {
		text-align: center;
	}

	.outputs {
		font-size: 20px;
		border: 2px solid black;
		margin-top: 15px;
		text-align: center;
	}
</style>
