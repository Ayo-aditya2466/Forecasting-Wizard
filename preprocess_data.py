import os
import sys

try:
    import pandas as pd
    import numpy as np
except ImportError as exc:
    raise ImportError(
        'pandas and numpy are required to run preprocess_data.py. '
        'Install them with `pip install pandas numpy`.'
    ) from exc


def get_root_dir():i
    return os.path.dirname(os.path.abspath(__file__))


def load_sales_data(root_dir):
    sales_path = os.path.join(root_dir, 'train_v2.csv')
    if not os.path.exists(sales_path):
        raise FileNotFoundError(f"Missing sales file: {sales_path}")

    sales_df = pd.read_csv(sales_path, parse_dates=['Date'])
    if 'Sales' not in sales_df.columns:
        raise ValueError('Expected `Sales` column in train_v2.csv')

    sales_df = sales_df.dropna(subset=['Date', 'Sales']).copy()
    sales_df['Sales'] = pd.to_numeric(sales_df['Sales'], errors='coerce')
    sales_df = sales_df.dropna(subset=['Sales'])
    sales_df['month'] = sales_df['Date'].dt.to_period('M').dt.to_timestamp('M')

    monthly_sales = (
        sales_df.groupby('month', as_index=False)['Sales']
        .mean()
        .rename(columns={'Sales': 'mean_monthly_sales'})
        .sort_values('month')
    )

    max_value = monthly_sales['mean_monthly_sales'].max()
    if max_value > 0:
        monthly_sales['normalized_monthly_sales'] = (
            monthly_sales['mean_monthly_sales'] / max_value
        ).clip(0.0, 1.0)
    else:
        monthly_sales['normalized_monthly_sales'] = 0.0

    return monthly_sales


def load_risk_data(root_dir):
    risk_path = os.path.join(root_dir, 'DataCoSupplyChainDataset.csv')
    if not os.path.exists(risk_path):
        raise FileNotFoundError(f"Missing risk file: {risk_path}")

    risk_df = pd.read_csv(risk_path, encoding='latin1')
    required_columns = ['Days for shipping (real)', 'Days for shipment (scheduled)', 'order date (DateOrders)']
    for col in required_columns:
        if col not in risk_df.columns:
            raise ValueError(f'Expected `{col}` column in DataCoSupplyChainDataset.csv')

    risk_df['Days for shipping (real)'] = pd.to_numeric(risk_df['Days for shipping (real)'], errors='coerce')
    risk_df['Days for shipment (scheduled)'] = pd.to_numeric(risk_df['Days for shipment (scheduled)'], errors='coerce')
    risk_df['shipping_delay'] = (
        risk_df['Days for shipping (real)'] - risk_df['Days for shipment (scheduled)']
    )

    risk_df['order_month'] = pd.to_datetime(risk_df['order date (DateOrders)'], errors='coerce')
    risk_df['order_month'] = risk_df['order_month'].dt.to_period('M').dt.to_timestamp('M')
    monthly_risk = (
        risk_df.dropna(subset=['order_month', 'shipping_delay'])
        .groupby('order_month', as_index=False)['shipping_delay']
        .mean()
        .rename(columns={'shipping_delay': 'avg_shipping_delay'})
        .sort_values('order_month')
    )

    min_delay = monthly_risk['avg_shipping_delay'].min()
    max_delay = monthly_risk['avg_shipping_delay'].max()
    if pd.isna(min_delay) or pd.isna(max_delay):
        monthly_risk['supply_chain_risk'] = np.nan
    elif max_delay == min_delay:
        monthly_risk['supply_chain_risk'] = 50.0
    else:
        monthly_risk['supply_chain_risk'] = (
            (monthly_risk['avg_shipping_delay'] - min_delay)
            / (max_delay - min_delay)
            * 100.0
        )

    monthly_risk['supply_chain_risk'] = monthly_risk['supply_chain_risk'].clip(0.0, 100.0)
    return monthly_risk


def build_unified_dataframe(sales_df, risk_df, horizon_months=24):
    target_months = sales_df.sort_values('month').tail(horizon_months).copy()
    unified = pd.merge(
        target_months,
        risk_df,
        left_on='month',
        right_on='order_month',
        how='left'
    )

    unified = unified[['month', 'mean_monthly_sales', 'normalized_monthly_sales', 'avg_shipping_delay', 'supply_chain_risk']]
    unified = unified.rename(columns={'month': 'period'})
    unified['period'] = pd.to_datetime(unified['period'])
    unified = unified.sort_values('period').reset_index(drop=True)

    return unified


def main():
    root_dir = get_root_dir()
    print(f'Root directory resolved to: {root_dir}')

    sales_df = load_sales_data(root_dir)
    print(f'Loaded sales data: {len(sales_df)} monthly rows')

    risk_df = load_risk_data(root_dir)
    print(f'Loaded risk data: {len(risk_df)} monthly rows')

    unified_df = build_unified_dataframe(sales_df, risk_df, horizon_months=24)
    output_path = os.path.join(root_dir, 'unified_cross_domain_data.csv')
    unified_df.to_csv(output_path, index=False)

    print('Data integration and preprocessing completed successfully.')
    print(f'Unified file written to: {output_path}')
    print('\nPreview of top 5 rows:')
    print(unified_df.head(5).to_string(index=False))


if __name__ == '__main__':
    main()
